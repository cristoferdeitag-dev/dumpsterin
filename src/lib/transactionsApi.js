// Read-only helpers for the `transactions` ledger from Dumpsterin app.
//
// Supabase RLS scopes results to the caller's company_id automatically
// (a provider can only see their own ledger). Admin reads work via the
// service role from server-side code, not this client-side module.

import { supabase } from './supabase';

// Categories we surface in the financial view, grouped by section.
export const FINANCIAL_CATEGORIES = {
  marketplace_inflows: ['marketplace_charge_customer'],
  provider_inflows: ['provider_invoice_charge', 'provider_invoice_oob_payment'],
  bd_outflows_to_provider: ['marketplace_payout_provider'],
  refunds: ['refund', 'chargeback'],
  stripe_fees: ['stripe_fee'],
};

// Pull the raw transactions for a date range scoped by RLS.
export async function fetchProviderTransactions(fromISO, toISO) {
  let query = supabase
    .from('transactions')
    .select('id, occurred_at, category, amount_cents, currency, booking_id, payment_method, stripe_object_id, description, metadata')
    .order('occurred_at', { ascending: false });
  if (fromISO) query = query.gte('occurred_at', fromISO);
  if (toISO) query = query.lte('occurred_at', toISO);
  const { data, error } = await query;
  if (error) {
    console.error('fetchProviderTransactions error:', error);
    return [];
  }
  return data || [];
}

// Aggregate the rows into the buckets the Revenue v2 financial view shows.
export function summarizeFinancial(rows) {
  const bucket = {
    marketplace_inflow_cents: 0,        // money customers paid for BD-sourced bookings (provider's wholesale slice lands in their Stripe)
    marketplace_payout_cents: 0,        // what was paid out of BD to the provider for marketplace bookings
    provider_invoice_card_cents: 0,     // provider sent quote, customer paid by card
    provider_invoice_oob_cents: 0,      // provider received cash / zelle / check
    refund_cents: 0,                    // negative refunds
    chargeback_cents: 0,
    stripe_fee_cents: 0,
    count_marketplace: 0,
    count_provider_invoice_card: 0,
    count_provider_invoice_oob: 0,
    count_refunds: 0,
  };
  for (const r of rows) {
    const a = r.amount_cents || 0;
    switch (r.category) {
      case 'marketplace_charge_customer':
        bucket.marketplace_inflow_cents += a;
        bucket.count_marketplace += 1;
        break;
      case 'marketplace_payout_provider':
        bucket.marketplace_payout_cents += Math.abs(a);
        break;
      case 'provider_invoice_charge':
        bucket.provider_invoice_card_cents += a;
        bucket.count_provider_invoice_card += 1;
        break;
      case 'provider_invoice_oob_payment':
        bucket.provider_invoice_oob_cents += a;
        bucket.count_provider_invoice_oob += 1;
        break;
      case 'refund':
        bucket.refund_cents += Math.abs(a);
        bucket.count_refunds += 1;
        break;
      case 'chargeback':
        bucket.chargeback_cents += Math.abs(a);
        break;
      case 'stripe_fee':
        bucket.stripe_fee_cents += Math.abs(a);
        break;
      default:
        break;
    }
  }
  // Provider's bank inflow = marketplace_payout (already paid by Stripe split)
  //                         + invoice charges (paid via Stripe to provider)
  //                         + oob payments (cash/zelle that landed outside Stripe but recorded)
  //                         − refunds − chargebacks − stripe fees absorbed
  const grossInflow =
    bucket.marketplace_payout_cents +
    bucket.provider_invoice_card_cents +
    bucket.provider_invoice_oob_cents;
  const deductions =
    bucket.refund_cents + bucket.chargeback_cents + bucket.stripe_fee_cents;
  bucket.net_to_bank_cents = grossInflow - deductions;
  bucket.gross_inflow_cents = grossInflow;
  return bucket;
}
