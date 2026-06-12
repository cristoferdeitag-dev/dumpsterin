// Dumpsterin Assistant — Supabase Edge Function (Phase 3: write tools).
//
// Multi-tenant chat agent. Each request is scoped to the caller's company_id
// via their Supabase profile, so a user from Company A can never read data
// from Company B regardless of what the model asks for.
//
// Phase 3 adds write tools (create/update/reschedule/cancel/change_status)
// using a confirmation-token pattern: the model first calls a write tool
// without a token, the function returns a draft + signed token, the model
// shows the draft to the user, and only on next turn (after user explicitly
// confirms) does the model call again with the token. Token is HMAC-signed
// so the model cannot forge it.
//
// Roles allowed: any except `driver`.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CONFIRM_SECRET = Deno.env.get("AGENT_CONFIRM_SECRET")!;
const CALENDAR_PUSH_URL = "https://tpdumpsters.com/api/calendar/push";
const CALENDAR_PUSH_SECRET = "tp-dumpsters-calpush-2026";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 8;
const TOKEN_TTL_SECONDS = 600;

// Sales channels.
const TIAGO_BOOKINGS = new Set(["CAL-20260410-VILLATORO", "CAL-20260413-KINGDOM"]);
const CHANNELS = ["website", "tiago", "asai"];
const CLOSED_STATUSES = ["completed", "delivered", "picked_up", "pickup_ready", "dumping", "ready_for_pickup"];
const EXPECTED_STATUSES = ["scheduled", "in_transit", "on_site", "quote_sent"];

// Status normalization: app uses some friendly aliases, DB uses canonical values.
const STATUS_TO_DB: Record<string, string> = {
  scheduled: "scheduled",
  in_transit: "in_transit",
  on_site: "delivered",
  delivered: "delivered",
  ready_for_pickup: "pickup_ready",
  pickup_ready: "pickup_ready",
  picked_up: "picked_up",
  dumping: "picked_up",
  completed: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  quote_sent: "quote_sent",
};
const VALID_DB_STATUSES = Array.from(new Set(Object.values(STATUS_TO_DB)));

const SALES_REPS = ["asai", "tiago", "web"];

const READ_TOOLS = [
  {
    name: "query_bookings",
    description:
      "Search bookings for the current company. Filters compose with AND. Use this for any question about jobs, deliveries, customers, or schedule.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status." },
        from_date: { type: "string", description: "ISO date YYYY-MM-DD inclusive." },
        to_date: { type: "string", description: "ISO date YYYY-MM-DD inclusive." },
        customer_search: { type: "string", description: "Substring match on customer_name." },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "query_revenue",
    description:
      "Money ACTUALLY collected (Stripe ledger) in a date range: total, by seller, card vs cash/zelle, refunds, extras, avg ticket. Also returns unpaid_pipeline (scheduled-not-collected) as secondary info. ALWAYS use this for any money/revenue question.",
    input_schema: {
      type: "object",
      properties: {
        from_date: { type: "string" },
        to_date: { type: "string" },
        channel: { type: "string", enum: CHANNELS },
      },
      required: ["from_date", "to_date"],
    },
  },
  {
    name: "forecast_month",
    description:
      "Snapshot for the current calendar month: closed, expected, and a simple linear projection.",
    input_schema: {
      type: "object",
      properties: { channel: { type: "string", enum: CHANNELS } },
    },
  },
  {
    name: "find_booking",
    description:
      "Find a booking by booking_number, customer name, or phone. Returns up to 5 matches with key fields. Use BEFORE update/reschedule/cancel/change_status to confirm you have the right one.",
    input_schema: {
      type: "object",
      properties: {
        booking_number: { type: "string", description: "Exact booking number (e.g. CAL-20260410-VILLATORO)." },
        customer_search: { type: "string", description: "Partial customer name or phone." },
      },
    },
  },
  {
    name: "where_is_dumpster",
    description:
      "Locate a physical dumpster (by label like '10YD-01' or by booking number). Returns its current status, where it's deployed, and which booking it belongs to. Also works to ask 'what dumpster is at <customer>'.",
    input_schema: {
      type: "object",
      properties: {
        dumpster_label: { type: "string", description: "Physical label e.g. '10YD-01'." },
        booking_number: { type: "string", description: "Booking the dumpster is on." },
        customer_search: { type: "string", description: "Customer the dumpster is with." },
      },
    },
  },
];

const WRITE_TOOL_DEFS: Array<{ name: string; description: string; props: Record<string, any>; required?: string[] }> = [
  {
    name: "create_booking",
    description:
      "Create a new booking. CALL FIRST without confirmation_token to get a draft, show it to the user, wait for explicit user confirmation ('sí', 'confirmo', 'OK'), THEN call again with the same args plus confirmation_token.",
    props: {
      customer_name: { type: "string" },
      customer_phone: { type: "string" },
      customer_email: { type: "string" },
      address: { type: "string" },
      city: { type: "string" },
      state: { type: "string" },
      zip: { type: "string" },
      dumpster_size: { type: "number", description: "10, 20, or 30" },
      service_type: { type: "string" },
      scheduled_date: { type: "string", description: "YYYY-MM-DD" },
      delivery_window: { type: "string", description: "e.g. 'AM' or '8-10am'" },
      total: { type: "number", description: "Final total. If omitted, base price is used." },
      base_price: { type: "number" },
      sales_rep: { type: "string", enum: SALES_REPS },
      notes: { type: "string" },
      source: { type: "string", description: "phone | walk-in | etc. Default 'phone'." },
    },
    required: ["customer_name", "address", "dumpster_size", "scheduled_date"],
  },
  {
    name: "update_booking",
    description:
      "Update fields of an existing booking. Reference by booking_number. Use the same draft→confirm flow.",
    props: {
      booking_number: { type: "string" },
      customer_name: { type: "string" },
      customer_phone: { type: "string" },
      customer_email: { type: "string" },
      address: { type: "string" },
      city: { type: "string" },
      state: { type: "string" },
      zip: { type: "string" },
      dumpster_size: { type: "number" },
      service_type: { type: "string" },
      total: { type: "number" },
      base_price: { type: "number" },
      sales_rep: { type: "string", enum: SALES_REPS },
      notes: { type: "string" },
    },
    required: ["booking_number"],
  },
  {
    name: "reschedule_booking",
    description: "Move the scheduled_date of a booking. Use draft→confirm flow.",
    props: {
      booking_number: { type: "string" },
      new_date: { type: "string", description: "YYYY-MM-DD" },
      new_window: { type: "string", description: "Optional delivery window override." },
    },
    required: ["booking_number", "new_date"],
  },
  {
    name: "cancel_booking",
    description:
      "Cancel a booking (sets status='cancelled' and appends a note). Use draft→confirm flow.",
    props: {
      booking_number: { type: "string" },
      reason: { type: "string" },
    },
    required: ["booking_number"],
  },
  {
    name: "change_status",
    description: `Change a booking's status. Valid: ${VALID_DB_STATUSES.join(", ")}. Use draft→confirm flow.`,
    props: {
      booking_number: { type: "string" },
      new_status: { type: "string" },
    },
    required: ["booking_number", "new_status"],
  },
];

function buildWriteToolSchemas() {
  return WRITE_TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object",
      properties: {
        ...t.props,
        confirmation_token: {
          type: "string",
          description:
            "Leave empty on first call to receive a draft + token. On second call, paste the token verbatim from the previous draft response, ONLY after the user has confirmed.",
        },
      },
      required: t.required || [],
    },
  }));
}

const TOOLS = [...READ_TOOLS, ...buildWriteToolSchemas()];

interface ToolUseBlock { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; }
interface TextBlock { type: "text"; text: string; }
type ContentBlock = ToolUseBlock | TextBlock;
interface ClaudeResponse { id: string; stop_reason: string; content: ContentBlock[]; }

// ── HMAC helpers ──
async function hmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(CONFIRM_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

interface TokenPayload {
  action: string;
  args: Record<string, unknown>;
  ts: number;
  uid: string;
  cid: string;
}

async function makeToken(payload: TokenPayload): Promise<string> {
  const key = await hmacKey();
  const json = JSON.stringify(payload);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(json));
  return b64urlEncode(JSON.stringify({ p: payload, s: bytesToHex(sig) }));
}

async function verifyToken(
  token: string,
  expectedAction: string,
  expectedUid: string,
  expectedCid: string
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; reason: string }> {
  let parsed: { p: TokenPayload; s: string };
  try {
    parsed = JSON.parse(b64urlDecode(token));
  } catch {
    return { ok: false, reason: "invalid_token_format" };
  }
  const { p, s } = parsed;
  if (!p || !s) return { ok: false, reason: "missing_fields" };
  const key = await hmacKey();
  const expectedSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(p)));
  if (bytesToHex(expectedSig) !== s) return { ok: false, reason: "bad_signature" };
  if (p.action !== expectedAction) return { ok: false, reason: "action_mismatch" };
  if (p.uid !== expectedUid) return { ok: false, reason: "user_mismatch" };
  if (p.cid !== expectedCid) return { ok: false, reason: "company_mismatch" };
  const ageSec = (Date.now() - p.ts) / 1000;
  if (ageSec > TOKEN_TTL_SECONDS) return { ok: false, reason: "token_expired" };
  return { ok: true, payload: p };
}

// ── Anthropic ──
async function callClaude(
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>
): Promise<ClaudeResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  const start = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      }),
      signal: ctrl.signal,
    });
    console.log(`[agent] claude ${res.status} in ${Date.now() - start}ms`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function channelOf(b: { booking_number?: string | null; source?: string | null }): string {
  if (b.source === "website") return "website";
  if (b.booking_number && TIAGO_BOOKINGS.has(b.booking_number)) return "tiago";
  return "asai";
}

// ── REST helpers ──
async function rest(path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
}

async function fetchBookingsRaw(
  companyId: string,
  filters: { status?: string; from_date?: string; to_date?: string; customer_search?: string; limit?: number }
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams();
  params.set("company_id", `eq.${companyId}`);
  params.set(
    "select",
    "booking_number,customer_name,customer_phone,address,city,state,zip,service_type,dumpster_size,scheduled_date,status,total,source,sales_rep,dumpster_id,notes,payment_status"
  );
  params.set("order", "scheduled_date.desc.nullslast");
  if (filters.status) params.set("status", `eq.${filters.status}`);
  if (filters.from_date) params.append("scheduled_date", `gte.${filters.from_date}`);
  if (filters.to_date) params.append("scheduled_date", `lte.${filters.to_date}`);
  if (filters.customer_search) params.set("customer_name", `ilike.*${filters.customer_search}*`);
  const lim = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
  params.set("limit", String(lim));
  const res = await rest(`/bookings?${params}`);
  if (!res.ok) throw new Error(`bookings query ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function findBookingByNumber(companyId: string, bookingNumber: string) {
  const params = new URLSearchParams({
    company_id: `eq.${companyId}`,
    booking_number: `eq.${bookingNumber}`,
    select: "*",
    limit: "1",
  });
  const res = await rest(`/bookings?${params}`);
  if (!res.ok) throw new Error(`find booking ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function pushCalendar(action: "create" | "update" | "delete", booking: Record<string, unknown>) {
  try {
    await fetch(CALENDAR_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-calendar-secret": CALENDAR_PUSH_SECRET },
      body: JSON.stringify({ action, booking }),
    });
  } catch (e) {
    console.error("calendar push failed:", e);
  }
}

async function auditLog(entry: {
  company_id: string;
  user_id: string;
  user_name: string;
  action: string;
  payload: unknown;
  result: unknown;
  booking_id?: string | null;
  error?: string | null;
}) {
  try {
    await rest("/agent_audit_log", {
      method: "POST",
      body: JSON.stringify({
        company_id: entry.company_id,
        user_id: entry.user_id,
        user_name: entry.user_name,
        action: entry.action,
        payload: entry.payload,
        result: entry.result,
        booking_id: entry.booking_id || null,
        error: entry.error || null,
      }),
    });
  } catch (e) {
    console.error("audit log failed:", e);
  }
}

function genBookingNumber(): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BK-${stamp}-${rand}`;
}

function summarize(action: string, args: Record<string, unknown>): string {
  switch (action) {
    case "create_booking": {
      const a = args as any;
      return `Create booking for ${a.customer_name} — ${a.dumpster_size}yd at ${a.address}${a.city ? ", " + a.city : ""} on ${a.scheduled_date}${a.total ? ` — $${a.total}` : ""}.`;
    }
    case "update_booking": {
      const a = args as any;
      const fields = Object.keys(a).filter((k) => k !== "booking_number" && k !== "confirmation_token");
      return `Update ${a.booking_number}: ${fields.map((k) => `${k}=${JSON.stringify(a[k])}`).join(", ")}.`;
    }
    case "reschedule_booking": {
      const a = args as any;
      return `Reschedule ${a.booking_number} to ${a.new_date}${a.new_window ? ` (${a.new_window})` : ""}.`;
    }
    case "cancel_booking": {
      const a = args as any;
      return `Cancel ${a.booking_number}${a.reason ? ` — reason: ${a.reason}` : ""}.`;
    }
    case "change_status": {
      const a = args as any;
      return `Change status of ${a.booking_number} → ${a.new_status}.`;
    }
  }
  return action;
}

// ── Read tools ──
async function runReadTool(name: string, input: Record<string, unknown>, companyId: string): Promise<unknown> {
  if (name === "query_bookings") {
    const rows = await fetchBookingsRaw(companyId, input);
    const enriched = rows.map((r) => ({ ...r, channel: channelOf(r as any) }));
    return { count: enriched.length, rows: enriched };
  }
  if (name === "query_revenue") {
    // Money ACTUALLY collected, straight from the Stripe-fed ledger — the
    // same source of truth as the Sales screen and the Home headline.
    const from = input.from_date as string;
    const to = input.to_date as string;
    const params = new URLSearchParams();
    params.set("provider_id", `eq.${companyId}`);
    params.set("select", "amount_cents,category,payment_method,metadata,bookings(source,sales_rep)");
    params.append("occurred_at", `gte.${from}`);
    params.append("occurred_at", `lte.${to}T23:59:59Z`);
    params.set("limit", "1000");
    const res = await rest(`/transactions?${params}`);
    if (!res.ok) throw new Error(`transactions query ${res.status}`);
    const txRows = (await res.json()) as Array<Record<string, any>>;

    const compRes = await rest(`/companies?id=eq.${companyId}&select=settings`);
    const comp = compRes.ok ? ((await compRes.json())[0] as Record<string, any> | undefined) : undefined;
    const defaultSeller = comp?.settings?.default_seller || "Direct invoices";

    let collected = 0, refunds = 0, card = 0, oob = 0, salesCount = 0;
    const bySeller: Record<string, number> = {};
    const extras = { overweight: 0, extra_days: 0, other: 0 };
    for (const r of txRows) {
      const a = Number(r.amount_cents) || 0;
      if (r.category === "refund" || r.category === "chargeback") { refunds += a; collected += a; continue; }
      if (a <= 0) continue;
      collected += a;
      salesCount += 1;
      if (r.category === "provider_invoice_oob_payment") oob += a; else card += a;
      const b = r.bookings;
      const who = b?.source === "website" ? "Online bookings" : b?.sales_rep
        ? (b.sales_rep as string).charAt(0).toUpperCase() + (b.sales_rep as string).slice(1)
        : defaultSeller;
      bySeller[who] = (bySeller[who] || 0) + a;
      const ex = r.metadata?.extras_cents;
      if (ex) { extras.overweight += ex.overweight || 0; extras.extra_days += ex.extra_days || 0; extras.other += ex.other || 0; }
    }

    // Secondary info only: scheduled bookings in range not collected yet.
    const pending = await fetchBookingsRaw(companyId, { from_date: from, to_date: to, limit: 100 });
    let unpaid = 0, unpaidCount = 0;
    for (const b of pending) {
      if ((b.status as string) === "cancelled") continue;
      if (((b as any).payment_status || "") !== "paid") { unpaid += Number(b.total) || 0; unpaidCount += 1; }
    }

    const usd = (c: number) => Math.round(c / 100);
    return {
      from_date: from, to_date: to,
      collected_total_usd: usd(collected),
      by_seller_usd: Object.fromEntries(Object.entries(bySeller).map(([k, v]) => [k, usd(v)])),
      card_usd: usd(card), cash_zelle_usd: usd(oob), refunds_usd: usd(refunds),
      extras_usd: { overweight: usd(extras.overweight), extra_days: usd(extras.extra_days), other: usd(extras.other) },
      sales_count: salesCount,
      avg_ticket_usd: salesCount > 0 ? usd(collected / salesCount) : 0,
      unpaid_pipeline: { amount_usd: Math.round(unpaid), count: unpaidCount, note: "bookings agendados en el rango que AÚN no se cobran — menciónalo solo si te lo preguntan" },
    };
  }
  if (name === "forecast_month") {
    const channelFilter = input.channel as string | undefined;
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0));
    const fmtStart = monthStart.toISOString().slice(0, 10);
    const fmtEnd = monthEnd.toISOString().slice(0, 10);
    // Run-rate from money ACTUALLY collected (ledger), not booking statuses.
    void channelFilter;
    const tparams = new URLSearchParams();
    tparams.set("provider_id", `eq.${companyId}`);
    tparams.set("select", "amount_cents,category");
    tparams.append("occurred_at", `gte.${fmtStart}`);
    tparams.append("occurred_at", `lte.${fmtEnd}T23:59:59Z`);
    tparams.set("limit", "1000");
    const tRes = await rest(`/transactions?${tparams}`);
    const tRows = tRes.ok ? ((await tRes.json()) as Array<Record<string, any>>) : [];
    let collectedCents = 0;
    for (const r of tRows) collectedCents += Number(r.amount_cents) || 0;

    const rows = await fetchBookingsRaw(companyId, { from_date: fmtStart, to_date: fmtEnd, limit: 100 });
    let unpaid = 0, unpaidCount = 0;
    for (const b of rows) {
      if ((b.status as string) === "cancelled") continue;
      if (((b as any).payment_status || "") !== "paid") { unpaid += Number(b.total) || 0; unpaidCount += 1; }
    }
    const daysInMonth = monthEnd.getUTCDate();
    const dayOfMonth = now.getUTCDate();
    const collected = collectedCents / 100;
    const projection = dayOfMonth > 0 ? (collected / dayOfMonth) * daysInMonth : 0;
    return {
      month: `${y}-${String(m + 1).padStart(2, "0")}`,
      day_of_month: dayOfMonth, days_in_month: daysInMonth,
      collected_usd: Math.round(collected),
      projection_runrate_usd: Math.round(projection),
      unpaid_pipeline: { amount_usd: Math.round(unpaid), count: unpaidCount, note: "agendado aún no cobrado — secundario" },
    };
  }
  if (name === "find_booking") {
    const params = new URLSearchParams({
      company_id: `eq.${companyId}`,
      select: "booking_number,customer_name,customer_phone,address,city,scheduled_date,status,total,sales_rep,dumpster_id,notes",
      order: "scheduled_date.desc.nullslast",
      limit: "5",
    });
    if (input.booking_number) params.set("booking_number", `eq.${input.booking_number}`);
    if (input.customer_search) params.set("customer_name", `ilike.*${input.customer_search}*`);
    const res = await rest(`/bookings?${params}`);
    const rows = await res.json();
    return { count: (rows as []).length, rows };
  }
  if (name === "where_is_dumpster") {
    if (input.dumpster_label) {
      const params = new URLSearchParams({
        company_id: `eq.${companyId}`,
        label: `eq.${input.dumpster_label}`,
        select: "id,label,size_yards,status",
        limit: "1",
      });
      const res = await rest(`/dumpsters?${params}`);
      const rows = await res.json();
      const dumpster = (rows as any[])[0];
      if (!dumpster) return { found: false, message: `No dumpster with label ${input.dumpster_label}` };
      const bp = new URLSearchParams({
        company_id: `eq.${companyId}`,
        dumpster_id: `eq.${dumpster.id}`,
        select: "booking_number,customer_name,address,city,scheduled_date,status",
        order: "scheduled_date.desc",
        limit: "1",
      });
      const bRes = await rest(`/bookings?${bp}`);
      const booking = ((await bRes.json()) as any[])[0] || null;
      return { found: true, dumpster, current_booking: booking };
    }
    if (input.booking_number || input.customer_search) {
      const params = new URLSearchParams({
        company_id: `eq.${companyId}`,
        select: "booking_number,customer_name,address,city,scheduled_date,status,dumpster_id",
        limit: "5",
      });
      if (input.booking_number) params.set("booking_number", `eq.${input.booking_number}`);
      if (input.customer_search) params.set("customer_name", `ilike.*${input.customer_search}*`);
      const res = await rest(`/bookings?${params}`);
      const bookings = (await res.json()) as any[];
      const enriched = await Promise.all(bookings.map(async (b) => {
        if (!b.dumpster_id) return { ...b, dumpster: null };
        const dRes = await rest(`/dumpsters?id=eq.${b.dumpster_id}&select=label,size_yards,status&limit=1`);
        const d = ((await dRes.json()) as any[])[0] || null;
        return { ...b, dumpster: d };
      }));
      return { count: enriched.length, rows: enriched };
    }
    return { error: "Provide dumpster_label OR booking_number OR customer_search" };
  }
  throw new Error(`Unknown read tool: ${name}`);
}

// ── Write tool execution ──
async function executeWrite(
  action: string,
  args: Record<string, unknown>,
  companyId: string,
  userId: string,
  userName: string
): Promise<unknown> {
  if (action === "create_booking") {
    const a = args as any;
    const bookingNumber = genBookingNumber();
    const total = a.total ?? a.base_price ?? 0;
    const row = {
      company_id: companyId,
      booking_number: bookingNumber,
      customer_name: a.customer_name || "",
      customer_phone: a.customer_phone || "",
      customer_email: a.customer_email || "",
      address: a.address || "",
      city: a.city || "",
      state: a.state || "CA",
      zip: a.zip || "",
      dumpster_size: a.dumpster_size || 10,
      service_type: a.service_type || "",
      scheduled_date: a.scheduled_date,
      delivery_window: a.delivery_window || "",
      status: "scheduled",
      base_price: a.base_price ?? total ?? 0,
      total: total,
      discount: 0,
      sales_rep: a.sales_rep || "asai",
      notes: a.notes || "",
      source: a.source || "phone",
    };
    const res = await rest("/bookings", { method: "POST", body: JSON.stringify(row) });
    if (!res.ok) throw new Error(`create failed ${res.status}: ${await res.text()}`);
    const inserted = (await res.json())[0];
    pushCalendar("create", inserted);
    await auditLog({ company_id: companyId, user_id: userId, user_name: userName, action, payload: args, result: { booking_number: inserted.booking_number, id: inserted.id }, booking_id: inserted.id });
    return { ok: true, booking_number: inserted.booking_number, id: inserted.id, summary: `Created ${inserted.booking_number}` };
  }
  if (action === "update_booking") {
    const a = args as any;
    const existing = await findBookingByNumber(companyId, a.booking_number);
    if (!existing) throw new Error(`Booking ${a.booking_number} not found`);
    const updates: Record<string, unknown> = {};
    for (const k of ["customer_name","customer_phone","customer_email","address","city","state","zip","dumpster_size","service_type","total","base_price","sales_rep","notes"]) {
      if (a[k] !== undefined) updates[k] = a[k];
    }
    const res = await rest(`/bookings?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (!res.ok) throw new Error(`update failed ${res.status}: ${await res.text()}`);
    const updated = (await res.json())[0];
    pushCalendar("update", updated);
    await auditLog({ company_id: companyId, user_id: userId, user_name: userName, action, payload: args, result: updated, booking_id: existing.id });
    return { ok: true, booking_number: updated.booking_number, updated_fields: Object.keys(updates) };
  }
  if (action === "reschedule_booking") {
    const a = args as any;
    const existing = await findBookingByNumber(companyId, a.booking_number);
    if (!existing) throw new Error(`Booking ${a.booking_number} not found`);
    const updates: Record<string, unknown> = { scheduled_date: a.new_date };
    if (a.new_window) updates.delivery_window = a.new_window;
    const res = await rest(`/bookings?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (!res.ok) throw new Error(`reschedule failed ${res.status}: ${await res.text()}`);
    const updated = (await res.json())[0];
    pushCalendar("update", updated);
    await auditLog({ company_id: companyId, user_id: userId, user_name: userName, action, payload: args, result: updated, booking_id: existing.id });
    return { ok: true, booking_number: updated.booking_number, new_date: a.new_date };
  }
  if (action === "cancel_booking") {
    const a = args as any;
    const existing = await findBookingByNumber(companyId, a.booking_number);
    if (!existing) throw new Error(`Booking ${a.booking_number} not found`);
    const noteAddition = a.reason ? `\n[Cancelled by ${userName}: ${a.reason}]` : `\n[Cancelled by ${userName}]`;
    const updates = { status: "cancelled", notes: `${existing.notes || ""}${noteAddition}` };
    const res = await rest(`/bookings?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (!res.ok) throw new Error(`cancel failed ${res.status}: ${await res.text()}`);
    const updated = (await res.json())[0];
    pushCalendar("delete", updated);
    await auditLog({ company_id: companyId, user_id: userId, user_name: userName, action, payload: args, result: updated, booking_id: existing.id });
    return { ok: true, booking_number: updated.booking_number, status: "cancelled" };
  }
  if (action === "change_status") {
    const a = args as any;
    const existing = await findBookingByNumber(companyId, a.booking_number);
    if (!existing) throw new Error(`Booking ${a.booking_number} not found`);
    const dbStatus = STATUS_TO_DB[(a.new_status as string).toLowerCase()];
    if (!dbStatus) throw new Error(`Invalid status '${a.new_status}'. Valid: ${VALID_DB_STATUSES.join(", ")}`);
    const res = await rest(`/bookings?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify({ status: dbStatus }) });
    if (!res.ok) throw new Error(`change_status failed ${res.status}: ${await res.text()}`);
    const updated = (await res.json())[0];
    pushCalendar(dbStatus === "cancelled" ? "delete" : "update", updated);
    await auditLog({ company_id: companyId, user_id: userId, user_name: userName, action, payload: args, result: updated, booking_id: existing.id });
    return { ok: true, booking_number: updated.booking_number, status: dbStatus };
  }
  throw new Error(`Unknown write action: ${action}`);
}

async function runWriteTool(
  name: string,
  input: Record<string, unknown>,
  companyId: string,
  userId: string,
  userName: string
): Promise<unknown> {
  // Strip confirmation_token from args used for signing/summary
  const { confirmation_token, ...args } = input as any;
  if (!confirmation_token) {
    const summary = summarize(name, args);
    const token = await makeToken({ action: name, args, ts: Date.now(), uid: userId, cid: companyId });
    return {
      pending_confirmation: true,
      summary,
      confirmation_token: token,
      expires_in_seconds: TOKEN_TTL_SECONDS,
      instruction:
        "Show this summary to the user verbatim. Ask 'Confirmas?'. ONLY when the user replies with 'sí', 'confirmo', 'OK', or similar, call this tool again with the SAME args plus confirmation_token. If the user wants to change something, call with new args (no token) to get a fresh draft.",
    };
  }
  // Token provided — verify
  const verify = await verifyToken(String(confirmation_token), name, userId, companyId);
  if (!verify.ok) {
    return { ok: false, error: `Token verification failed: ${verify.reason}. Re-issue draft.` };
  }
  // Re-validate args match (shallow stringify equality of stable shape)
  const expectedArgs = JSON.stringify(verify.payload.args);
  const providedArgs = JSON.stringify(args);
  if (expectedArgs !== providedArgs) {
    return { ok: false, error: "Args changed since draft was issued. Re-issue draft.", expected: verify.payload.args, provided: args };
  }
  return await executeWrite(name, args, companyId, userId, userName);
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  companyId: string,
  userId: string,
  userName: string
): Promise<unknown> {
  const isWrite = WRITE_TOOL_DEFS.some((t) => t.name === name);
  if (isWrite) return await runWriteTool(name, input, companyId, userId, userName);
  return await runReadTool(name, input, companyId);
}

async function getProfile(accessToken: string): Promise<{ id: string; company_id: string; role: string; full_name: string } | null> {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const userId = user?.id as string | undefined;
  if (!userId) return null;
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=company_id,role,full_name&id=eq.${userId}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!profRes.ok) return null;
  const rows = await profRes.json();
  if (!rows[0]) return null;
  return { id: userId, ...rows[0] };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const profile = await getProfile(token);
    if (!profile) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (profile.role === "driver") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const userMessages: Array<{ role: string; content: string }> = body.messages || [];
    if (!Array.isArray(userMessages) || userMessages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `Eres "Asistente", un agente integrado en la app Dumpsterin que ayuda al equipo con sus operaciones de renta de dumpsters.

Hoy es ${today} (UTC).
Usuario: ${profile.full_name || "Sin nombre"} (rol: ${profile.role}).
Empresa actual: company_id ${profile.company_id}. TODA consulta y acción se limita a esta empresa — los tools filtran automáticamente, no menciones el ID.

DATOS:
- bookings: cliente, dirección, fecha, dumpster_size, total, status, source, sales_rep, dumpster_id, notes.
- Statuses canónicos: scheduled, in_transit, delivered, pickup_ready, picked_up, completed, cancelled, quote_sent.
- Canales: website (tpdumpsters.com online), tiago (manual Tiago), asai (manual default).
- dumpsters: label físico (ej. 10YD-01), size_yards, status (available/deployed/maintenance).

TOOLS DE LECTURA: query_bookings, query_revenue, forecast_month, find_booking, where_is_dumpster.

REGLA DE DINERO (crítica): para CUALQUIER pregunta de dinero/ingresos usa query_revenue, que reporta lo COBRADO de verdad (libro conectado a Stripe — la misma verdad que la pantalla Sales). Responde con "cobrado/recibido", nunca con "cerrados/esperados". El unpaid_pipeline (agendado aún no cobrado) menciónalo SOLO si el usuario pregunta explícitamente por lo pendiente o por proyecciones, y déjalo claro como secundario. No inventes proyecciones salvo que te las pidan (usa forecast_month).
TOOLS DE ESCRITURA: create_booking, update_booking, reschedule_booking, cancel_booking, change_status.

REGLA CRÍTICA — FLUJO DE CONFIRMACIÓN PARA ESCRITURAS:
1. PRIMER paso: llama el tool de escritura SIN confirmation_token (omítelo). El tool te devolverá un summary y un confirmation_token.
2. Muestra el summary al usuario y pregunta "¿Confirmas?". NO ejecutes nada todavía.
3. SEGUNDO paso (en el siguiente turno): SOLO si el usuario respondió afirmativamente ("sí", "confirmo", "OK", "dale", "adelante"), llama el MISMO tool con los MISMOS args + el confirmation_token recibido. Si el usuario quiere cambiar algo, ignora el token viejo y llama de nuevo sin token con los args actualizados.
4. Si el usuario dice "no", "cancela", "espera", confirma que no harás nada. NO llames el tool con token.
5. NUNCA inventes un confirmation_token. Solo úsalos exactamente como te los entregó el tool en una respuesta previa.

ESTILO:
- Responde en español operativo y conciso.
- Antes de update/reschedule/cancel/change_status, si la referencia a la booking es ambigua, llama find_booking primero para confirmar de cuál se trata.
- Cita booking_number cuando referencies un job específico.
- Para cifras de ventas, siempre usa los tools — no estimes ni inventes.
- Pide aclaración corta cuando una instrucción sea ambigua, antes de tirar tools.`;

    const conv: Array<{ role: string; content: unknown }> = userMessages.map((m) => ({ role: m.role, content: m.content }));
    const toolCalls: Array<{ name: string; input: unknown; output: unknown }> = [];
    let finalText = "";

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      console.log(`[agent] turn=${turn} convLen=${conv.length}`);
      const resp = await callClaude(systemPrompt, conv);
      console.log(`[agent] stop_reason=${resp.stop_reason}`);
      if (resp.stop_reason === "end_turn" || resp.stop_reason === "stop_sequence") {
        finalText = resp.content.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n");
        break;
      }
      if (resp.stop_reason === "tool_use") {
        conv.push({ role: "assistant", content: resp.content });
        const toolResults = [];
        for (const block of resp.content) {
          if (block.type !== "tool_use") continue;
          let output: unknown;
          try {
            console.log(`[agent] tool=${block.name} input=${JSON.stringify(block.input).slice(0, 200)}`);
            output = await runTool(block.name, block.input, profile.company_id, profile.id, profile.full_name || "Unknown");
          } catch (err) {
            output = { error: String(err) };
            console.error(`[agent] tool=${block.name} error: ${err}`);
            // Audit failed write attempts too
            const isWrite = WRITE_TOOL_DEFS.some((t) => t.name === block.name);
            if (isWrite) {
              await auditLog({
                company_id: profile.company_id, user_id: profile.id, user_name: profile.full_name || "Unknown",
                action: block.name, payload: block.input, result: null, error: String(err),
              });
            }
          }
          toolCalls.push({ name: block.name, input: block.input, output });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(output).slice(0, 8000),
          });
        }
        conv.push({ role: "user", content: toolResults });
        continue;
      }
      finalText = "(stopped: " + resp.stop_reason + ")";
      break;
    }

    return new Response(JSON.stringify({ reply: finalText, toolCalls }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("agent error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
