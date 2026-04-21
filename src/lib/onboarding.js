import { supabase } from './supabase';

/**
 * Crea una empresa completa con su setup inicial a partir de los datos del onboarding.
 * Inserta en un orden transaccional: company → pricing → dumpsters → drivers → profile (admin).
 *
 * @param {object} data - Datos recolectados del cuestionario
 * @returns {Promise<{company: object, error?: string}>}
 */
export async function createCompanyWithSetup(data) {
  const {
    name,
    slug,
    phone,
    email,
    website,
    timezone = 'America/Los_Angeles',
    serviceZips = [],
    serviceCities = [],
    fleet = {}, // {10: 5, 20: 5, 30: 5}
    services = [], // ['General Debris', 'Clean Soil', ...]
    pricing = [], // [{service: 'General Debris', size: 10, price: 649}, ...]
    policies = {}, // {rentalDays: 7, extraDayRate: 49, overweightPerTon: 135, ...}
    drivers = [], // [{name: 'Asai', phone: '+1555...'}, ...]
  } = data;

  if (!name || !slug || !phone || !email) {
    return { error: 'Nombre, slug, teléfono y email son requeridos' };
  }

  // 1) Create company (settings jsonb holds website, service_areas, policies)
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .insert({
      name,
      slug,
      phone,
      email,
      timezone,
      settings: {
        website: website || null,
        service_cities: serviceCities,
        service_zips: serviceZips,
        policies: policies,
        services_offered: data.services || [],
      },
    })
    .select()
    .single();

  if (companyErr) return { error: `Error creando empresa: ${companyErr.message}` };

  const companyId = company.id;

  // 2) Pricing (incluye políticas como rental_days, extra_day_rate, overweight_rate)
  if (pricing.length) {
    const pricingRows = pricing.map(p => ({
      company_id: companyId,
      service_type: p.service,
      dumpster_size: p.size,
      base_price: p.price,
      rental_days: policies.rentalDays || 7,
      extra_day_rate: policies.extraDayRate || 49,
      overweight_rate: policies.overweightPerTon || 135,
      is_active: true,
    }));
    const { error: pErr } = await supabase.from('pricing').insert(pricingRows);
    if (pErr) console.error('Pricing insert warning:', pErr.message);
  }

  // 3) Dumpsters (genera N placeholder por cada tamaño)
  const dumpsterRows = [];
  Object.entries(fleet).forEach(([size, count]) => {
    const sizeNum = parseInt(size, 10);
    const cnt = parseInt(count, 10) || 0;
    for (let i = 1; i <= cnt; i++) {
      dumpsterRows.push({
        company_id: companyId,
        label: `${sizeNum}YD-${String(i).padStart(2, '0')}`,
        size_yards: sizeNum,
        status: 'available',
      });
    }
  });
  if (dumpsterRows.length) {
    const { error: dErr } = await supabase.from('dumpsters').insert(dumpsterRows);
    if (dErr) console.error('Dumpsters insert warning:', dErr.message);
  }

  // 4) Drivers (la columna es full_name en vez de name)
  if (drivers.length) {
    const driverRows = drivers
      .filter(d => d.name)
      .map(d => ({
        company_id: companyId,
        full_name: d.name,
        phone: d.phone || null,
        email: d.email || null,
        status: 'active',
        is_active: true,
      }));
    if (driverRows.length) {
      const { error: drErr } = await supabase.from('drivers').insert(driverRows);
      if (drErr) console.error('Drivers insert warning:', drErr.message);
    }
  }

  // 5) Associate current auth user as admin/owner of this company
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const userId = session.user.id;
    const userEmail = session.user.email;
    const userName = session.user.user_metadata?.full_name || userEmail?.split('@')[0] || 'Admin';

    // Create or update profile
    const { error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        company_id: companyId,
        full_name: userName,
        email: userEmail,
        role: 'admin',
        is_active: true,
      });
    if (profErr) console.error('Profile upsert warning:', profErr.message);
  }

  return { company };
}

/**
 * Sugerencias de precio por defecto (basadas en pricing de TP Dumpsters)
 */
export const DEFAULT_PRICING = {
  'General Debris': { 10: 649, 20: 699, 30: 799, 40: 899 },
  'Household Clean Out': { 10: 649, 20: 699, 30: 799, 40: 899 },
  'Construction Debris': { 10: 649, 20: 699, 30: 799, 40: 899 },
  'Roofing': { 10: 649, 20: 699, 30: 799, 40: 899 },
  'Green Waste': { 10: 649, 20: 699, 30: 799, 40: 899 },
  'Clean Soil': { 10: 649, 20: 649, 30: 649, 40: 649 },
  'Clean Concrete': { 10: 649, 20: 649, 30: 649, 40: 649 },
  'Mixed Materials': { 10: 799, 20: 799, 30: 799, 40: 799 },
};

export const SERVICE_OPTIONS = [
  'General Debris',
  'Household Clean Out',
  'Construction Debris',
  'Roofing',
  'Green Waste',
  'Clean Soil',
  'Clean Concrete',
  'Mixed Materials',
];

export const DEFAULT_POLICIES = {
  rentalDays: 7,
  extraDayRate: 49,
  overweightPerTon: 135,
  mattressFee: 35,
  applianceFee: 50,
  tireFee: 30,
  electronicsFee: 25,
  cancellationFee: 150,
  cancellationNoticeHours: 24,
  deliveryWindows: ['morning', 'afternoon'],
  sameDay: true,
};

/**
 * Genera un slug a partir del nombre
 */
export function slugify(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Verifica si un slug ya existe
 */
export async function isSlugAvailable(slug) {
  if (!slug) return false;
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .limit(1);
  return !data || data.length === 0;
}
