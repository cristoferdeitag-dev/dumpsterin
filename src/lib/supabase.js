import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mbirzaocjkhqydtuqmze.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iaXJ6YW9jamtocXlkdHVxbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjkxNTUsImV4cCI6MjA5MTE0NTE1NX0.-ERkDAXi5YOsy-CdmEEMKDUgpXQQcgJt0HY0b7t2SuA';

const CALENDAR_PUSH_URL = 'https://tpdumpsters.com/api/calendar/push';
const CALENDAR_PUSH_SECRET = 'tp-dumpsters-calpush-2026';

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

export async function createBooking(booking) {
  const companyId = await getCompanyId();
  const dbBooking = mapBookingToDB(booking, companyId);
  const { data, error } = await supabase
    .from('bookings')
    .insert(dbBooking)
    .select()
    .single();
  if (error) { console.error('createBooking error:', error); return null; }
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
  if (error) { console.error('updateBooking error:', error); return null; }
  pushToCalendar('update', data);
  return mapBookingFromDB(data);
}

export async function updateBookingStatus(id, status) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('updateBookingStatus error:', error); return; }
  // Status changes (cancellations, etc.) might affect the calendar event
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
  if (error) console.error('markReviewRequested error:', error);
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
  if (error) { console.error('bulkMarkReviewsRequestedBefore error:', error); return 0; }
  return (data || []).length;
}

export async function deleteBooking(id) {
  // Read calendar IDs before deleting so we can clean up the events
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, calendar_delivery_id, calendar_pickup_id')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);
  if (error) { console.error('deleteBooking error:', error); return; }
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
  // Map app status to DB status if needed
  const dbStatus = status === 'on_yard' ? 'available' : status === 'on_site' ? 'deployed' : status;
  // Try by label first (app uses label as ID), then by UUID
  const { error } = await supabase
    .from('dumpsters')
    .update({ status: dbStatus })
    .eq('label', id);
  if (error) {
    // Fallback: try by UUID
    const { error: err2 } = await supabase
      .from('dumpsters')
      .update({ status: dbStatus })
      .eq('id', id);
    if (err2) console.error('updateDumpsterStatus error:', err2);
  }
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
    total: parseFloat(b.base_price || 0) - parseFloat(b.discount || 0),
    assignedDumpster: b.dumpster_id ? (_dumpsterLabelMap[b.dumpster_id] || b.dumpster_id) : null,
    assignedDriver: b.driver_id || null,
    notes: b.notes || '',
    source: b.source || 'phone',
    generatedBy: _generatedByMap[b.booking_number] || 'asai',
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

  return {
    company_id: companyId,
    booking_number: b.id || `BK-${Date.now().toString(36).toUpperCase()}`,
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
