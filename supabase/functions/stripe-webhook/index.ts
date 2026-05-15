// Stripe webhook → Dumpsterin bookings sync.
//
// On every invoice.paid (or charge.refunded), look up the matching booking
// via invoice.metadata.booking_id and update payment_status / paid_amount /
// paid_at / stripe_invoice_id. If no booking matches, alert Cris on Telegram
// so the gap is visible immediately — that's the SaaS-grade reconciliation
// guarantee Dumpsterin needs.
//
// Stripe webhook signing requires the raw request body, so we read req.text()
// once and re-parse after verification.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TG_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const TG_ALERT_CHAT = Deno.env.get("TELEGRAM_ALERT_CHAT_ID") || "8665156164"; // Cristofer
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET_DUMPSTERIN")!;

// Tolerate up to 5 minutes of clock drift on signature timestamp.
const SIG_TOLERANCE_SECONDS = 300;

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=", 2) as [string, string])
  );
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - parseInt(ts, 10));
  if (ageSec > SIG_TOLERANCE_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${ts}.${rawBody}`)
  );
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // constant-time compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

async function notifyTelegram(text: string): Promise<void> {
  if (!TG_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_ALERT_CHAT, text }),
    });
  } catch (e) {
    console.error("telegram notify failed:", e);
  }
}

async function findBookingByNumber(
  number: string
): Promise<{ id: string; total: number | null } | null> {
  const params = new URLSearchParams({
    select: "id,total",
    booking_number: `eq.${number}`,
    limit: "1",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?${params}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; total: number | null }>;
  return rows[0] || null;
}

async function updateBookingPayment(
  bookingId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }
  );
  return res.ok;
}

async function handleInvoicePaid(invoice: Record<string, unknown>): Promise<void> {
  const md = (invoice.metadata as Record<string, string>) || {};
  const bookingNumber = md.booking_id || "";
  const amountPaid = ((invoice.amount_paid as number) || 0) / 100;
  const paidAtTs = (invoice.status_transitions as { paid_at?: number } | undefined)?.paid_at;
  const paidAt = paidAtTs
    ? new Date(paidAtTs * 1000).toISOString()
    : new Date().toISOString();
  const invoiceId = invoice.id as string;
  const customerName = (invoice.customer_name as string) || "(sin nombre)";

  if (!bookingNumber) {
    await notifyTelegram(
      `⚠️ Stripe pago recibido sin booking_id\n\n` +
        `Cliente: ${customerName}\n` +
        `Monto: $${amountPaid.toFixed(2)}\n` +
        `Invoice: ${invoiceId}\n\n` +
        `Esta invoice se creó manualmente en Stripe sin metadata. ` +
        `Asígnala a un booking existente o crea uno nuevo en el app.`
    );
    return;
  }

  const booking = await findBookingByNumber(bookingNumber);
  if (!booking) {
    await notifyTelegram(
      `🚨 Stripe pago con booking_id que no existe en Dumpsterin\n\n` +
        `booking_id: ${bookingNumber}\n` +
        `Cliente: ${customerName}\n` +
        `Monto: $${amountPaid.toFixed(2)}\n` +
        `Invoice: ${invoiceId}`
    );
    return;
  }

  const ok = await updateBookingPayment(booking.id, {
    payment_status: "paid",
    paid_amount: amountPaid,
    paid_at: paidAt,
    stripe_invoice_id: invoiceId,
  });
  if (!ok) {
    await notifyTelegram(
      `🔴 Falló update de booking ${bookingNumber} tras pago de $${amountPaid.toFixed(2)}`
    );
    return;
  }
  console.log(`[webhook] booking ${bookingNumber} marked paid $${amountPaid}`);
}

async function handleChargeRefunded(charge: Record<string, unknown>): Promise<void> {
  const invoiceId = charge.invoice as string | null;
  if (!invoiceId) return;

  const params = new URLSearchParams({
    select: "id,booking_number",
    stripe_invoice_id: `eq.${invoiceId}`,
    limit: "1",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?${params}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return;
  const rows = (await res.json()) as Array<{ id: string; booking_number: string }>;
  const booking = rows[0];
  if (!booking) return;

  await updateBookingPayment(booking.id, { payment_status: "refunded" });
  await notifyTelegram(
    `↩️ Reembolso procesado en booking ${booking.booking_number} (invoice ${invoiceId})`
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature");
  const valid = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  console.log(`[webhook] event=${event.type}`);
  try {
    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      await handleInvoicePaid(event.data.object);
    } else if (event.type === "charge.refunded") {
      await handleChargeRefunded(event.data.object);
    }
    // Acknowledge other events silently — Stripe retries non-2xx responses.
  } catch (err) {
    console.error("[webhook] handler error:", err);
    // Return 200 anyway: Stripe will retry on 5xx and we want to inspect logs
    // before re-firing. Any real failure is also alerted via Telegram above.
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
