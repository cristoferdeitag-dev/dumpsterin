// CRUD helpers for the customers table (RLS scopes to provider's company).

import { supabase } from './supabase';

export async function searchCustomers(query, { limit = 8 } = {}) {
  if (!query || query.length < 1) return [];
  // ilike on name + email
  const { data, error } = await supabase
    .from('customers')
    .select('id, full_name, email, phone, billing_address, delivery_address, is_marketplace, tags, lifetime_value_cents, bookings_count')
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
    .eq('is_marketplace', false)
    .limit(limit);
  if (error) {
    console.error('searchCustomers error:', error);
    return [];
  }
  return data || [];
}

export async function listCustomers({ includeMarketplace = true, limit = 100 } = {}) {
  let q = supabase
    .from('customers')
    .select('id, full_name, email, phone, billing_address, is_marketplace, tags, lifetime_value_cents, bookings_count, last_booking_at')
    .order('last_booking_at', { ascending: false, nullsLast: true })
    .limit(limit);
  if (!includeMarketplace) q = q.eq('is_marketplace', false);
  const { data, error } = await q;
  if (error) {
    console.error('listCustomers error:', error);
    return [];
  }
  return data || [];
}

export async function createCustomer(input) {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      billing_address: input.billing_address || null,
      delivery_address: input.delivery_address || null,
      notes: input.notes || null,
      tags: input.tags || [],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCustomer(id, patch) {
  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
