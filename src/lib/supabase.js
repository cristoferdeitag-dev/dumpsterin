import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mbirzaocjkhqydtuqmze.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iaXJ6YW9jamtocXlkdHVxbXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NjkxNTUsImV4cCI6MjA5MTE0NTE1NX0.-ERkDAXi5YOsy-CdmEEMKDUgpXQQcgJt0HY0b7t2SuA';

// TP Dumpsters company ID (first and only company for now)
export const TP_COMPANY_ID = null; // Will be set after first fetch

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetch company ID on init
let _companyId = null;
export async function getCompanyId() {
  if (_companyId) return _companyId;
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', 'tp-dumpsters')
    .single();
  _companyId = data?.id || null;
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
  return mapBookingFromDB(data);
}

export async function updateBookingStatus(id, status) {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);
  if (error) console.error('updateBookingStatus error:', error);
}

export async function deleteBooking(id) {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);
  if (error) console.error('deleteBooking error:', error);
}

// ── DUMPSTERS ──
export async function fetchDumpsters() {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('dumpsters')
    .select('*')
    .eq('company_id', companyId)
    .order('label');
  if (error) { console.error('fetchDumpsters error:', error); return []; }
  return (data || []).map(mapDumpsterFromDB);
}

export async function updateDumpsterStatus(id, status) {
  // Map app status to DB status
  const dbStatus = status === 'on_yard' ? 'available' : status === 'on_site' ? 'deployed' : status;
  const { error } = await supabase
    .from('dumpsters')
    .update({ status: dbStatus })
    .eq('id', id);
  if (error) console.error('updateDumpsterStatus error:', error);
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
    assignedDumpster: b.dumpster_id || null,
    assignedDriver: b.driver_id || null,
    notes: b.notes || '',
    source: b.source || 'phone',
    generatedBy: b.source || 'phone',
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
    id: d.id,
    label: d.label || d.id,
    size: d.size_yards ? `${d.size_yards}yd` : '',
    sizeLabel,
    status: mapDumpsterStatusFromDB(d.status),
    assignedBooking: null, // TODO: join with bookings
    _dbId: d.id,
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
