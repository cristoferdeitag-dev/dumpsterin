// Marketplace (BookingDumpsters) orders inside the provider app — Fase A.
// Reads ride on the shared Supabase session (RLS policy "provider sees
// assigned bookings"); writes go through BD's provider APIs with the SAME
// JWT, so BD enforces its own auth/state machine and stays the single
// source of truth for marketplace orders.

import { supabase } from './supabase';

const BD = 'https://bookingdumpsters.com';

async function authToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function fetchMarketplaceOrders() {
  const { data, error } = await supabase
    .from('bd_bookings')
    .select('id, booking_number, customer_name, customer_phone, street, city, zip, size, material, delivery_date, pickup_date, delivery_window, delivery_slot, status, provider_confirmation_status, provider_acceptance_deadline, total_cents')
    .in('status', ['paid', 'dispatched', 'delivered', 'picking_up'])
    .order('delivery_date', { ascending: true });
  if (error) {
    console.error('fetchMarketplaceOrders:', error);
    return [];
  }
  return data || [];
}

async function bdPost(path, body) {
  const token = await authToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${BD}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `BD ${path} failed (${res.status})`);
  return data;
}

export function acceptOrder(bookingNumber, deliverySlot) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/accept`,
    deliverySlot ? { delivery_slot: deliverySlot } : {});
}

export function rejectOrder(bookingNumber, reason) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/reject`,
    reason ? { reason } : {});
}

// kind: in_transit | delivered | picking_up | transfer_ticket_uploaded | completed
// files: { photo?: File, ticket?: File } (web File objects)
export async function providerAction(bookingId, kind, { payload, photo, ticket } = {}) {
  const token = await authToken();
  if (!token) throw new Error('Not signed in');
  const form = new FormData();
  form.append('bookingId', bookingId);
  form.append('kind', kind);
  if (payload) form.append('payload', JSON.stringify(payload));
  if (photo) form.append('photo', photo);
  if (ticket) form.append('ticket', ticket);
  const res = await fetch(`${BD}/api/provider/action`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `action ${kind} failed (${res.status})`);
  return data;
}
