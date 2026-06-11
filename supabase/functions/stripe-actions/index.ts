// Provider-facing Stripe actions that need the secret key, so they live
// server-side. v1: mark an open invoice as paid out-of-band (cash / Zelle)
// straight from the app — Stripe flips the invoice to paid, fires
// invoice.paid, and the stripe-webhook function writes the ledger row and
// marks the booking. Single writer: this function never touches the DB.
//
// Auth: the gateway verifies the caller's Supabase JWT (verify_jwt = true).
// We additionally check the caller belongs to the booking's company.
//
// TP-only for now (TP's own Stripe account). Future Connect providers get
// routed with a Stripe-Account header per company.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY_TP")!;

type Json = Record<string, unknown>;

function jwtSub(req: Request): string | null {
  // Signature already verified by the gateway; we only need the subject.
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function dbGet(path: string): Promise<Json[] | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as Json[];
}

async function stripeForm(path: string, form: Record<string, string>): Promise<Json> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await res.json()) as Json;
  if (!res.ok) {
    const err = (data.error as { message?: string } | undefined)?.message || "Stripe error";
    throw new Error(err);
  }
  return data;
}

function reply(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const userId = jwtSub(req);
  if (!userId) return reply(401, { error: "No user" });

  let body: { action?: string; booking_id?: string; method?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Bad JSON" });
  }

  if (body.action !== "mark_paid_oob") return reply(400, { error: "Unknown action" });
  const method = body.method === "zelle" ? "zelle" : "cash";
  if (!body.booking_id) return reply(400, { error: "booking_id required" });

  const profiles = await dbGet(
    `profiles?id=eq.${userId}&select=company_id,role&limit=1`
  );
  const profile = profiles?.[0] as { company_id?: string; role?: string } | undefined;
  if (!profile?.company_id) return reply(403, { error: "No company" });

  const bookings = await dbGet(
    `bookings?id=eq.${encodeURIComponent(body.booking_id)}&select=id,booking_number,company_id,stripe_invoice_id,payment_status&limit=1`
  );
  const booking = bookings?.[0] as
    | {
        id: string;
        booking_number: string;
        company_id: string;
        stripe_invoice_id: string | null;
        payment_status: string | null;
      }
    | undefined;
  if (!booking) return reply(404, { error: "Booking not found" });
  if (booking.company_id !== profile.company_id && profile.role !== "admin") {
    return reply(403, { error: "Not your booking" });
  }
  if (booking.payment_status === "paid") {
    return reply(409, { error: "Booking is already paid" });
  }
  if (!booking.stripe_invoice_id) {
    return reply(409, {
      error: "This booking has no open Stripe invoice. Create the invoice first.",
    });
  }

  try {
    // Tag how it was actually paid, then flip the invoice to paid.
    await stripeForm(`invoices/${booking.stripe_invoice_id}`, {
      "metadata[oob_method]": method,
    });
    const inv = await stripeForm(`invoices/${booking.stripe_invoice_id}/pay`, {
      paid_out_of_band: "true",
    });
    return reply(200, {
      ok: true,
      invoice_status: (inv.status as string) || "paid",
      booking_number: booking.booking_number,
    });
  } catch (e) {
    return reply(502, { error: e instanceof Error ? e.message : "Stripe error" });
  }
});
