import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getCompanyId } from '../src/lib/supabase';

// Payments — the live, always-reconciled view of every dollar in Stripe.
// Fed by the stripe-webhook ledger (`transactions`): card payments, cash/Zelle
// (out-of-band), refunds — whether the invoice was born in the app or made by
// hand in Stripe. Hand-made ones land as "To classify" and get linked to a
// booking right here, so the books never drift from Stripe again.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function monthRange(year, month) {
  const from = new Date(Date.UTC(year, month, 1)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  return { from, to };
}

function fmt(cents) {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'card', label: 'Card' },
  { key: 'oob', label: 'Cash/Zelle' },
  { key: 'refund', label: 'Refunds' },
  { key: 'nobooking', label: 'No booking linked' },
];

export default function PaymentsScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [rows, setRows] = useState([]);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('list'); // list | customers
  const [classifyTx, setClassifyTx] = useState(null); // tx being classified
  const [bookingQuery, setBookingQuery] = useState('');
  const [bookingResults, setBookingResults] = useState([]);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = monthRange(year, month);
    const { data, error } = await supabase
      .from('transactions')
      .select('id, occurred_at, category, amount_cents, payment_method, booking_id, stripe_object_id, description, metadata')
      .gte('occurred_at', from)
      .lt('occurred_at', to)
      .order('occurred_at', { ascending: false });
    if (error) {
      Alert.alert('Error', 'Could not load payments. Pull to retry.');
      setRows([]);
    } else {
      setRows(data || []);
    }

    // Bookings with an invoice issued but not paid yet → candidates for the
    // "mark paid cash/Zelle" action.
    const cid = await getCompanyId();
    if (cid) {
      const { data: inv } = await supabase
        .from('bookings')
        .select('id, booking_number, customer_name, base_price, payment_status, stripe_invoice_id, scheduled_date')
        .eq('company_id', cid)
        .not('stripe_invoice_id', 'is', null)
        .neq('payment_status', 'paid')
        .order('scheduled_date', { ascending: false })
        .limit(20);
      setOpenInvoices(inv || []);
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const s = { total: 0, card: 0, oob: 0, refunds: 0 };
    for (const r of rows) {
      const a = r.amount_cents || 0;
      if (r.category === 'refund' || r.category === 'chargeback') s.refunds += a;
      else if (r.category === 'provider_invoice_oob_payment') { s.oob += a; s.total += a; }
      else if (a > 0) { s.card += a; s.total += a; }
    }
    s.total += s.refunds; // refunds are negative
    return s;
  }, [rows]);

  const visible = useMemo(() => rows.filter((r) => {
    if (filter === 'nobooking') return !r.booking_id;
    if (filter === 'card') return r.category === 'provider_invoice_charge' && r.payment_method === 'card';
    if (filter === 'oob') return r.category === 'provider_invoice_oob_payment';
    if (filter === 'refund') return r.category === 'refund' || r.category === 'chargeback';
    return true;
  }), [rows, filter]);

  // Spend grouped by customer, straight from what Stripe already knows —
  // no booking cross-referencing needed (Cris 2026-06-11).
  const customers = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const name =
        r.metadata?.customer_name ||
        (r.description || '').split('·')[0].trim() ||
        '(no name)';
      if (!map[name]) map[name] = { name, total: 0, count: 0 };
      map[name].total += r.amount_cents || 0;
      if ((r.amount_cents || 0) > 0) map[name].count += 1;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [rows]);

  // ── Classify flow ──
  const searchBookings = useCallback(async (q) => {
    setBookingQuery(q);
    if (!q || q.length < 2) { setBookingResults([]); return; }
    const cid = await getCompanyId();
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_number, customer_name, scheduled_date, base_price, payment_status')
      .eq('company_id', cid)
      .or(`booking_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
      .order('scheduled_date', { ascending: false })
      .limit(6);
    setBookingResults(data || []);
  }, []);

  async function assignBooking(booking, method) {
    if (!classifyTx) return;
    setWorking(true);
    const { error } = await supabase.rpc('classify_transaction', {
      p_tx: classifyTx.id,
      p_booking: booking ? booking.id : null,
      p_category: null,
      p_method: method || null,
    });
    setWorking(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setClassifyTx(null);
    setBookingQuery('');
    setBookingResults([]);
    load();
  }

  // ── Mark paid out-of-band (cash / Zelle) ──
  function markPaidOob(booking) {
    Alert.alert(
      `Mark ${booking.booking_number} as paid`,
      `${booking.customer_name || ''} — how was it paid?`,
      [
        { text: 'Cash', onPress: () => doMarkPaid(booking, 'cash') },
        { text: 'Zelle', onPress: () => doMarkPaid(booking, 'zelle') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function doMarkPaid(booking, method) {
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('stripe-actions', {
      body: { action: 'mark_paid_oob', booking_id: booking.id, method },
    });
    setWorking(false);
    if (error || data?.error) {
      Alert.alert('Error', data?.error || error?.message || 'Could not mark as paid');
      return;
    }
    Alert.alert('Done', `${booking.booking_number} marked as paid (${method}). Stripe is updated; the ledger entry lands in a few seconds.`);
    setTimeout(load, 4000);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  }

  const badge = (r) => {
    if (r.category === 'refund') return { label: 'Refund', bg: '#FDECEA', fg: '#C00' };
    if (r.category === 'provider_invoice_oob_payment')
      return { label: r.payment_method === 'zelle' ? 'Zelle' : 'Cash', bg: '#E6F4EA', fg: '#1E7E34' };
    return { label: 'Card', bg: '#EAF1FB', fg: '#1D4ED8' };
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A', flex: 1 }}>Payments</Text>
        <TouchableOpacity onPress={prevMonth} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A', minWidth: 110, textAlign: 'center' }}>
          {MONTHS[month]} {year}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={20} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FFCD11" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {/* Summary cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Collected', value: fmt(summary.total), big: true },
              { label: 'Card', value: fmt(summary.card) },
              { label: 'Cash/Zelle', value: fmt(summary.oob) },
              { label: 'Refunds', value: summary.refunds ? `-${fmt(summary.refunds)}` : '$0.00' },
            ].map((c) => (
              <View key={c.label} style={{ flexGrow: 1, minWidth: c.big ? '100%' : '30%', backgroundColor: c.big ? '#14213D' : '#FAFAFA', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.big ? '#14213D' : '#E8E8E8' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: c.big ? '#9fb0d0' : '#666' }}>{c.label}</Text>
                <Text style={{ fontSize: c.big ? 26 : 16, fontWeight: '800', color: c.big ? '#FFCD11' : '#1A1A1A' }}>{c.value}</Text>
              </View>
            ))}
          </View>

          {/* Open invoices → mark paid cash/zelle */}
          {openInvoices.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 }}>
                Open invoices ({openInvoices.length})
              </Text>
              {openInvoices.map((b) => (
                <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 10, borderWidth: 1, borderColor: '#E8E8E8', padding: 10, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#1A1A1A', fontSize: 13 }}>
                      {b.booking_number} · {b.customer_name || '—'}
                    </Text>
                    <Text style={{ color: '#666', fontSize: 12 }}>
                      {b.scheduled_date || ''} · ${Number(b.base_price || 0).toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => markPaidOob(b)}
                    disabled={working}
                    style={{ backgroundColor: '#00C853', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Mark paid</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* View toggle: every payment vs grouped by customer */}
          <View style={{ flexDirection: 'row', backgroundColor: '#F2F2F2', borderRadius: 10, padding: 3, marginBottom: 10 }}>
            {[{ k: 'list', l: 'Payments' }, { k: 'customers', l: 'By customer' }].map((t) => (
              <TouchableOpacity
                key={t.k}
                onPress={() => setView(t.k)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: view === t.k ? '#14213D' : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: view === t.k ? '#FFCD11' : '#555' }}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {view === 'customers' && (
            <>
              {customers.length === 0 && (
                <Text style={{ color: '#888', textAlign: 'center', marginTop: 24 }}>No payments this month.</Text>
              )}
              {customers.map((c, i) => (
                <View key={c.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                  <Text style={{ width: 26, color: '#999', fontWeight: '700', fontSize: 12 }}>{i + 1}</Text>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: '700', color: '#1A1A1A', fontSize: 13 }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>{c.count} payment{c.count === 1 ? '' : 's'}</Text>
                  </View>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: c.total < 0 ? '#C00' : '#1A1A1A' }}>
                    {c.total < 0 ? '-' : ''}{fmt(c.total)}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Filter chips */}
          {view === 'list' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: filter === f.key ? '#14213D' : '#F2F2F2' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: filter === f.key ? '#FFCD11' : '#444' }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          )}

          {/* Transactions list */}
          {view === 'list' && visible.length === 0 && (
            <Text style={{ color: '#888', textAlign: 'center', marginTop: 24 }}>
              No payments in this view.
            </Text>
          )}
          {view === 'list' && visible.map((r) => {
            const bd = badge(r);
            const isNeg = (r.amount_cents || 0) < 0;
            return (
              <TouchableOpacity
                key={r.id}
                disabled={!!r.booking_id}
                onPress={() => setClassifyTx(r)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontWeight: '700', color: '#1A1A1A', fontSize: 13 }} numberOfLines={1}>
                    {r.description || r.stripe_object_id}
                  </Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>
                    {new Date(r.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {r.booking_id ? ' · linked to booking' : ' · tap to link a booking'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: isNeg ? '#C00' : '#1A1A1A' }}>
                    {isNeg ? '-' : ''}{fmt(r.amount_cents)}
                  </Text>
                  <View style={{ backgroundColor: bd.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: bd.fg }}>{bd.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Classify modal */}
      <Modal visible={!!classifyTx} transparent animationType="slide" onRequestClose={() => setClassifyTx(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1A1A1A', flex: 1 }}>
                Classify payment
              </Text>
              <TouchableOpacity onPress={() => setClassifyTx(null)}>
                <Ionicons name="close" size={22} color="#1A1A1A" />
              </TouchableOpacity>
            </View>
            {classifyTx && (
              <Text style={{ color: '#444', marginBottom: 10, fontSize: 13 }}>
                {classifyTx.description} — {fmt(classifyTx.amount_cents)}
              </Text>
            )}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6 }}>
              Link to a booking (search by number or customer):
            </Text>
            <TextInput
              value={bookingQuery}
              onChangeText={searchBookings}
              placeholder="e.g. BK-1042 or Estrada"
              autoFocus
              style={{ borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginBottom: 8 }}
            />
            <ScrollView style={{ maxHeight: 220 }}>
              {bookingResults.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  disabled={working}
                  onPress={() => assignBooking(b, null)}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
                >
                  <Text style={{ fontWeight: '700', fontSize: 13, color: '#1A1A1A' }}>
                    {b.booking_number} · {b.customer_name || '—'}
                  </Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>
                    {b.scheduled_date || ''} · ${Number(b.base_price || 0).toFixed(2)} · {b.payment_status || 'unpaid'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              disabled={working}
              onPress={() => assignBooking(null, null)}
              style={{ marginTop: 10, alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: '#F2F2F2' }}
            >
              <Text style={{ fontWeight: '700', color: '#444', fontSize: 13 }}>
                No booking — just mark as reviewed
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
