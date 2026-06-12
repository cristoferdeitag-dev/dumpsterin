import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mbirzaocjkhqydtuqmze.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iaXJ6YW9jamtocXlkdHVxbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjkxNTUsImV4cCI6MjA5MTE0NTE1NX0.-ERkDAXi5YOsy-CdmEEMKDUgpXQQcgJt0HY0b7t2SuA';

const CALENDAR_PUSH_URL = 'https://tpdumpsters.com/api/calendar/push';
const CALENDAR_PUSH_SECRET = process.env.EXPO_PUBLIC_CALENDAR_PUSH_SECRET || '';

// Fire-and-forget push to Google Calendar after a booking CRUD. Errors are
// logged but never block the UI — calendar sync is best-effort, the cron
// (every 15 min) reconciles anything that drifts.
function pushToCalendar(op, booking) {
  if (!booking?.id) return;
  fetch(CALENDAR_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-calendar-push-secret': CALENDAR_PUSH_SECRET },
    body: JSON.stringify({ op, booking }),
  })
    .then((r) => {
      if (!r.ok) console.warn(`calendar push ${op} returned`, r.status);
    })
    .catch((e) => console.warn(`calendar push ${op} failed:`, e));
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Company ID viene del profile del usuario autenticado.
// Lo obtenemos de la sesión activa — si no hay sesión, devolvemos null.
let _companyId = null;
export function setAuthCompanyId(id) {
  _companyId = id;
}
export async function getCompanyId() {
  if (_companyId) return _companyId;
  // Fallback: lookup del profile del usuario autenticado
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', session.user.id)
    .maybeSingle();
  _companyId = data?.company_id || null;
  return _companyId;
}

// ── BOOKINGS ──
export async function fetchBookings() {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('company_id', companyId)
    .order('scheduled_date', { ascending: false });
  if (error) { console.error('fetchBookings error:', error); return []; }
  return (data || []).map(mapBookingFromDB);
}

// Auto-close: a job whose pickup date passed 3+ days ago can't still be
// "open" in real life — close it so the boards stay honest without anyone
// clicking (Cris 2026-06-12). Runs once per app load.
export async function autoCloseStaleBookings(bookings) {
  const cutoff = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const stale = (bookings || []).filter(
    (b) => b.pickupDate && b.pickupDate < cutoff && !['completed', 'cancelled'].includes(b.status)
  );
  if (stale.length === 0) return bookings;
  const ids = stale.map((b) => b.id);
  const { error } = await supabase.from('bookings').update({ status: 'completed' }).in('id', ids);
  if (error) {
    console.error('autoCloseStaleBookings failed:', error);
    return bookings;
  }
  console.log(`Auto-closed ${ids.length} stale booking(s):`, stale.map((b) => b.bookingNumber || b.id).join(', '));
  return bookings.map((b) => (ids.includes(b.id) ? { ...b, status: 'completed' } : b));
}

// Mutation helpers throw a clean error message on failure. Callers wrap in
// try/catch so the UI can show the failure to the user.
function raise(prefix, error) {
  const msg = error?.message || error?.hint || JSON.stringify(error);
  console.error(`${prefix}:`, error);
  throw new Error(`${prefix}: ${msg}`);
}

export async function createBooking(booking) {
  const companyId = await getCompanyId();
  const dbBooking = mapBookingToDB(booking, companyId);
  const { data, error } = await supabase
    .from('bookings')
    .insert(dbBooking)
    .select()
    .single();
  if (error) raise('createBooking failed', error);
  pushToCalendar('create', data);
  return mapBookingFromDB(data);
}

export async function updateBooking(id, updates) {
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) raise('updateBooking failed', error);
  pushToCalendar('update', data);
  return mapBookingFromDB(data);
}

// Convenience wrapper for callers that have an app-shape booking object.
// Only persists editable fields — `mapBookingToDB` itself guards optional
// keys with `if (b.X !== undefined)`.
export async function updateBookingFull(booking) {
  const companyId = await getCompanyId();
  const dbPatch = mapBookingToDB(booking, companyId);
  // Drop columns that should never be updated post-create.
  delete dbPatch.company_id;
  return updateBooking(booking.id, dbPatch);
}

export async function updateBookingStatus(id, status) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) raise('updateBookingStatus failed', error);
  if (status === 'cancelled') {
    pushToCalendar('delete', data);
  } else {
    pushToCalendar('update', data);
  }
}

export async function markReviewRequested(id, timestamp) {
  const { error } = await supabase
    .from('bookings')
    .update({ review_requested_at: timestamp })
    .eq('id', id);
  if (error) raise('markReviewRequested failed', error);
}

export async function bulkMarkReviewsRequestedBefore(isoDate) {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('bookings')
    .update({ review_requested_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .lte('scheduled_date', isoDate)
    .is('review_requested_at', null)
    .in('status', ['delivered', 'completed', 'picked_up', 'pickup_ready'])
    .select('id');
  if (error) raise('bulkMarkReviewsRequestedBefore failed', error);
  return (data || []).length;
}

export async function deleteBooking(id) {
  // Capture calendar IDs first so we can clean up after the row is gone.
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, calendar_delivery_id, calendar_pickup_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);
  if (error) raise('deleteBooking failed', error);
  if (existing) pushToCalendar('delete', existing);
}

// Dumpster UUID → Label lookup cache
let _dumpsterLabelMap = {};

// GeneratedBy lookup (until we add the column to Supabase)
const _generatedByMap = {
  'CAL-20260410-VILLATORO': 'tiago',
  'CAL-20260413-KINGDOM': 'tiago',
  // All others default to 'asai'
};

// ── DUMPSTERS ──
export async function fetchDumpsters() {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('dumpsters')
    .select('*')
    .eq('company_id', companyId)
    .order('label');
  if (error) { console.error('fetchDumpsters error:', error); return []; }
  // Build UUID→label map
  (data || []).forEach(d => { _dumpsterLabelMap[d.id] = d.label || d.id; });
  return (data || []).map(mapDumpsterFromDB);
}

export async function updateDumpsterStatus(id, status) {
  const dbStatus = status === 'on_yard' ? 'available' : status === 'on_site' ? 'deployed' : status;
  // Try by label first (the app uses label as ID), then fall back to UUID.
  const { data: byLabel, error } = await supabase
    .from('dumpsters')
    .update({ status: dbStatus })
    .eq('label', id)
    .select('id');
  if (!error && byLabel && byLabel.length > 0) return;
  const { error: err2 } = await supabase
    .from('dumpsters')
    .update({ status: dbStatus })
    .eq('id', id);
  if (err2) raise('updateDumpsterStatus failed', err2);
}

// ── DRIVERS ──
export async function fetchDrivers() {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('company_id', companyId);
  if (error) { console.error('fetchDrivers error:', error); return []; }
  return (data || []).map(d => ({
    id: d.id,
    name: d.full_name,
    phone: d.phone || '',
    status: d.is_active ? 'active' : 'inactive',
    assignedBookings: [],
  }));
}

// ── CUSTOMERS ──
export async function fetchCustomers() {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .order('full_name');
  if (error) { console.error('fetchCustomers error:', error); return []; }
  return data || [];
}

// ── MAPPERS ──
function mapBookingFromDB(b) {
  // Build an extras array from the agg columns so the UI can render them as
  // a list. The DB stores totals (extra_days_fee, overweight_fee,
  // special_items_fee) — each non-zero column becomes one line item.
  const extras = [];
  const extraDaysFee = parseFloat(b.extra_days_fee) || 0;
  const extraDayRate = parseFloat(b.extra_day_rate) || 49;
  if (extraDaysFee > 0) {
    const qty = extraDayRate > 0 ? Math.round(extraDaysFee / extraDayRate) : 1;
    extras.push({ type: 'extra_days', label: 'Extra Days', qty, rate: extraDayRate, amount: extraDaysFee });
  }
  const overweightFee = parseFloat(b.overweight_fee) || 0;
  if (overweightFee > 0) {
    extras.push({ type: 'overweight', label: 'Overweight', qty: null, rate: null, amount: overweightFee });
  }
  const specialItemsFee = parseFloat(b.special_items_fee) || 0;
  if (specialItemsFee > 0) {
    extras.push({ type: 'special_items', label: 'Special Items', qty: null, rate: null, amount: specialItemsFee });
  }
  const extrasTotal = extraDaysFee + overweightFee + specialItemsFee;

  return {
    id: b.id,
    bookingNumber: b.booking_number || '',
    customerName: b.customer_name || '',
    phone: b.customer_phone || '',
    email: b.customer_email || '',
    deliveryAddress: [b.address, b.city, b.state, b.zip].filter(Boolean).join(', '),
    dumpsterSize: b.dumpster_size ? `${b.dumpster_size}yd` : '',
    serviceType: b.service_type || '',
    materialType: b.service_type || '',
    deliveryDate: b.scheduled_date || '',
    deliveryWindow: b.delivery_window || '',
    pickupDate: b.pickup_date || null,
    status: mapStatusFromDB(b.status),
    basePrice: parseFloat(b.base_price) || 0,
    discount: parseFloat(b.discount) || 0,
    specialItems: [],
    extras,
    extrasTotal,
    total: parseFloat(b.base_price || 0) - parseFloat(b.discount || 0) + extrasTotal,
    assignedDumpster: b.dumpster_id ? (_dumpsterLabelMap[b.dumpster_id] || b.dumpster_id) : null,
    assignedDriver: b.driver_id || null,
    notes: b.notes || '',
    notesFromCustomer: b.notes_from_customer || '',
    billingAddress: b.billing_address || null,
    authorizedCharges: !!b.authorized_charges,
    source: b.source || 'phone',
    // Stripe sync fields — needed so Revenue can switch between cash basis
    // (paid_at) and service basis (scheduled_date). paid_at is the ISO
    // timestamp Stripe marked the invoice/charge as paid; paid_amount is
    // the actual amount received (may differ from total on partial pay).
    paidAt: b.paid_at ? b.paid_at.slice(0, 10) : '',
    paidAmount: parseFloat(b.paid_amount) || 0,
    paymentStatus: b.payment_status || '',
    stripeInvoiceId: b.stripe_invoice_id || null,
    // Raw extra-charge agg columns — needed so mapBookingToDB can round-trip
    // them without losing values when editing.
    extraDaysFee: extraDaysFee,
    extraDayRate: extraDayRate,
    overweightFee: overweightFee,
    specialItemsFee: specialItemsFee,
    // Schedule-time fields — for Google Calendar sync.
    scheduledTime: b.scheduled_time || null,
    rentalDays: b.rental_days || null,
    lat: b.lat != null ? Number(b.lat) : null,
    lng: b.lng != null ? Number(b.lng) : null,
    // Prefer the editable DB column if set; fall back to the legacy hardcoded
    // map for older bookings that haven't been re-attributed in the UI yet.
    generatedBy: b.sales_rep || _generatedByMap[b.booking_number] || 'asai',
    reviewRequestedAt: b.review_requested_at || null,
    createdAt: b.created_at ? b.created_at.split('T')[0] : '',
    // DB-specific fields
    _dbId: b.id,
    _companyId: b.company_id,
    _customerId: b.customer_id,
  };
}

function mapBookingToDB(b, companyId) {
  // Parse address parts
  const addrParts = (b.deliveryAddress || '').split(',').map(s => s.trim());
  const sizeNum = parseInt((b.dumpsterSize || '').replace('yd', '')) || 10;

  // Build the DB row including ALL editable fields. Previously this dropped
  // extras_fee, paid_at, stripe_invoice_id, sales_rep, scheduled_time —
  // meaning edits silently lost data. Only set keys that are actually
  // present on `b` so partial-update callers don't wipe values they didn't
  // intend to touch.
  const row = {
    company_id: companyId,
    booking_number: b.bookingNumber || b.id || `BK-${Date.now().toString(36).toUpperCase()}`,
    customer_name: b.customerName || '',
    customer_phone: b.phone || '',
    customer_email: b.email || '',
    address: addrParts[0] || '',
    city: addrParts[1] || '',
    state: addrParts[2] || 'CA',
    zip: addrParts[3] || '',
    dumpster_size: sizeNum,
    service_type: b.serviceType || '',
    scheduled_date: b.deliveryDate || null,
    delivery_window: b.deliveryWindow || '',
    pickup_date: b.pickupDate || null,
    status: mapStatusToDB(b.status || 'scheduled'),
    base_price: b.basePrice || 0,
    discount: b.discount || 0,
    notes: b.notes || '',
    source: b.source || 'phone',
  };

  // Optional / write-through fields — only include if the caller set them.
  if (b.scheduledTime !== undefined) row.scheduled_time = b.scheduledTime || null;
  if (b.rentalDays !== undefined) row.rental_days = b.rentalDays || null;
  if (b.lat !== undefined) row.lat = b.lat;
  if (b.lng !== undefined) row.lng = b.lng;
  if (b.notesFromCustomer !== undefined) row.notes_from_customer = b.notesFromCustomer;
  if (b.billingAddress !== undefined) row.billing_address = b.billingAddress;
  if (b.authorizedCharges !== undefined) row.authorized_charges = !!b.authorizedCharges;
  if (b.generatedBy !== undefined) row.sales_rep = b.generatedBy;
  // Stripe sync fields — set when a payment lands.
  if (b.paidAt !== undefined) row.paid_at = b.paidAt || null;
  if (b.paidAmount !== undefined) row.paid_amount = b.paidAmount;
  if (b.paymentStatus !== undefined) row.payment_status = b.paymentStatus;
  if (b.stripeInvoiceId !== undefined) row.stripe_invoice_id = b.stripeInvoiceId;
  // Extra-charge aggregates — must be written so edits don't lose them.
  if (b.extraDaysFee !== undefined) row.extra_days_fee = b.extraDaysFee || 0;
  if (b.extraDayRate !== undefined) row.extra_day_rate = b.extraDayRate || 49;
  if (b.overweightFee !== undefined) row.overweight_fee = b.overweightFee || 0;
  if (b.specialItemsFee !== undefined) row.special_items_fee = b.specialItemsFee || 0;

  return row;
}

function mapDumpsterFromDB(d) {
  const sizeLabel = d.size_yards ? `${d.size_yards} Yard` : '';
  return {
    id: d.label || d.id,  // Use label (10YD-01) as the visible ID
    size: d.size_yards ? `${d.size_yards}yd` : '',
    sizeLabel,
    status: d.status || 'available',  // Keep DB status as-is (available/deployed/maintenance)
    assignedBooking: null,
    _dbId: d.id,  // Keep UUID for DB operations
  };
}

// Status mapping (DB uses simpler statuses, app has more granular ones)
function mapStatusFromDB(dbStatus) {
  const map = { delivered: 'on_site', pickup_ready: 'ready_for_pickup' };
  return map[dbStatus] || dbStatus;
}

function mapStatusToDB(appStatus) {
  const map = { on_site: 'delivered', ready_for_pickup: 'pickup_ready', dumping: 'picked_up' };
  return map[appStatus] || appStatus;
}

function mapDumpsterStatusFromDB(dbStatus) {
  const map = { available: 'on_yard', deployed: 'on_site' };
  return map[dbStatus] || dbStatus;
}
