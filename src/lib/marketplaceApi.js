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
  // Active jobs (paid..picking_up) PLUS jobs that were picked up and still owe
  // a disposal report (status flips to "completed" on pickup, so we also match
  // disposal_status to keep them visible until the report is submitted).
  const { data, error } = await supabase
    .from('bd_bookings')
    .select('id, booking_number, customer_name, customer_phone, street, city, zip, size, material, delivery_date, pickup_date, delivery_window, delivery_slot, status, provider_confirmation_status, provider_acceptance_deadline, pickup_status, disposal_status, total_cents')
    .or('status.in.(paid,dispatched,delivered,picking_up),disposal_status.eq.in_transit_to_transfer_station')
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

// --- Granular endpoints (the correct ones BD's web portal uses) -------------
// These write the per-phase status fields (delivery_status/pickup_status/...),
// the side-event tables, AND fire the customer notifications — which the legacy
// /api/provider/action below does NOT. Migrating the lifecycle here (Fase 1)
// fixes the "customer never gets notified" gap.

// Upload one photo to BD and return its signed URL. category for a provider:
// 'delivery' | 'pickup' | 'transfer-station' | 'scale-ticket'.
export async function uploadBookingPhoto(bookingNumber, category, file) {
  const token = await authToken();
  if (!token) throw new Error('Not signed in');
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  const res = await fetch(
    `${BD}/api/booking/${encodeURIComponent(bookingNumber)}/upload-photo`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `photo upload failed (${res.status})`);
  return data.signedUrl;
}

// Delivery: driver on the way (paid -> dispatched).
export function deliveryOnTheWay(bookingNumber) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/delivery`,
    { action: 'on_the_way' });
}

// Delivery: complete with photos (dispatched -> delivered). BD requires 2.
export function completeDelivery(bookingNumber, photoUrls) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/delivery`,
    { action: 'complete', delivery_photo_urls: photoUrls });
}

// Pickup: on the way (delivered -> picking_up).
export function pickupOnTheWay(bookingNumber) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/pickup`,
    { action: 'on_the_way' });
}

// Pickup: complete with photos (picking_up -> completed + disposal pending).
export function completePickup(bookingNumber, photoUrls) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/pickup`,
    { action: 'complete', pickup_photo_urls: photoUrls });
}

// Disposal: provider submits transfer-station evidence + scale ticket. The
// provider does NOT charge anything — BookingDumpsters reviews this report and
// executes any overweight charge to the customer. fields: {
//   transfer_station_photo_urls:[2], scale_ticket_photo_url, net_weight_lbs?,
//   scale_ticket_number?, extra_items_found?, restricted_items_found?, provider_notes? }
export function submitDisposal(bookingNumber, fields) {
  return bdPost(`/api/provider/booking/${encodeURIComponent(bookingNumber)}/disposal`, fields);
}

// --- Legacy endpoint (still used for pickup/ticket until those migrate) ------
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
