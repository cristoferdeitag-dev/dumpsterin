import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getCompanyId } from '../src/lib/supabase';
import { useAuth } from '../src/context/AuthContext';

// Sales report, provider-first (Cris 2026-06-11): one simple page a provider
// understands at a glance — total collected, where it came from, what sold,
// and who the star customers are. The old "expected revenue" tab is gone:
// a paid booking is money in the bank, not a forecast.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function fmt(cents) {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function Bar({ label, cents, total, color }) {
  const p = total > 0 ? Math.max(0, Math.min(100, (cents / total) * 100)) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A' }}>
          {fmt(cents)} <Text style={{ color: '#888', fontWeight: '600' }}>({p.toFixed(0)}%)</Text>
        </Text>
      </View>
      <View style={{ height: 8, backgroundColor: '#EFEFEF', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ width: `${p}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function RevenueScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  // Unlinked manual invoices are attributed to the company's default seller
  // (for TP that's Asaí — she makes every hand invoice). Each provider can
  // have their own; without one they show as "Direct invoices".
  const defaultSeller = profile?.companies?.settings?.default_seller || 'Direct invoices';
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState([]);
  const [prevCollected, setPrevCollected] = useState(null);
  const [unitRows, setUnitRows] = useState([]);
  const [priorNames, setPriorNames] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(Date.UTC(year, month, 1)).toISOString();
    const to = new Date(Date.UTC(year, month + 1, 1)).toISOString();

    // Ledger with the linked booking's source/rep embedded (FK join).
    const { data } = await supabase
      .from('transactions')
      .select('amount_cents, category, payment_method, booking_id, metadata, bookings(source, sales_rep)')
      .gte('occurred_at', from)
      .lt('occurred_at', to);
    setTx(data || []);

    // Same day-range of the previous month, for a fair comparison.
    const day = Math.min(now.getUTCDate(), 28);
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();
    const prevFrom = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const prevTo = isCurrentMonth
      ? new Date(Date.UTC(year, month - 1, day, 23, 59, 59)).toISOString()
      : new Date(Date.UTC(year, month, 1)).toISOString();
    const { data: prev } = await supabase
      .from('transactions')
      .select('amount_cents')
      .gte('occurred_at', prevFrom)
      .lt('occurred_at', prevTo);
    setPrevCollected((prev || []).reduce((s, r) => s + (r.amount_cents || 0), 0));

    // Customers seen BEFORE this month → lets us split new vs repeat.
    const { data: prior } = await supabase
      .from('transactions')
      .select('metadata')
      .lt('occurred_at', from)
      .gt('amount_cents', 0)
      .limit(2000);
    setPriorNames(new Set((prior || [])
      .map((r) => (r.metadata?.customer_name || '').toLowerCase().trim())
      .filter(Boolean)));

    // Units delivered this month, by size, with their money (from bookings).
    const cid = await getCompanyId();
    if (cid) {
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const nextStart = month === 11
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 2).padStart(2, '0')}-01`;
      const { data: units } = await supabase
        .from('bookings')
        .select('dumpster_size, base_price, discount, paid_amount')
        .eq('company_id', cid)
        .neq('status', 'cancelled')
        .gte('scheduled_date', monthStart)
        .lt('scheduled_date', nextStart);
      setUnitRows(units || []);
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    let collected = 0, refunds = 0, salesCount = 0;
    const sellers = {}; // 'Online bookings' | rep name | defaultSeller
    const customers = {};
    const extras = { overweight: 0, extra_days: 0, other: 0 };
    let newMoney = 0, repeatMoney = 0, newCount = 0, repeatCount = 0;
    const seenThisMonth = new Set();
    for (const r of tx) {
      const a = r.amount_cents || 0;
      if (r.category === 'refund' || r.category === 'chargeback') { refunds += a; collected += a; continue; }
      if (a <= 0) continue;
      collected += a;
      salesCount += 1;
      const b = r.bookings;
      const who = b?.source === 'website'
        ? 'Online bookings'
        : b?.sales_rep
          ? cap(b.sales_rep)
          : defaultSeller;
      sellers[who] = (sellers[who] || 0) + a;
      const name = r.metadata?.customer_name;
      if (name) {
        customers[name] = (customers[name] || 0) + a;
        const key = name.toLowerCase().trim();
        const isRepeat = priorNames.has(key) || seenThisMonth.has(key);
        if (isRepeat) { repeatMoney += a; repeatCount += 1; }
        else { newMoney += a; newCount += 1; }
        seenThisMonth.add(key);
      }
      const ex = r.metadata?.extras_cents;
      if (ex) {
        extras.overweight += ex.overweight || 0;
        extras.extra_days += ex.extra_days || 0;
        extras.other += ex.other || 0;
      }
    }
    const change = prevCollected > 0 ? ((collected - prevCollected) / prevCollected) * 100 : null;
    const sizes = {};
    for (const u of unitRows) {
      const key = `${u.dumpster_size || '?'}yd`;
      const money = Math.round(((Number(u.paid_amount) || 0) || (Number(u.base_price) || 0) - (Number(u.discount) || 0)) * 100);
      if (!sizes[key]) sizes[key] = { n: 0, cents: 0 };
      sizes[key].n += 1;
      sizes[key].cents += Math.max(0, money);
    }
    const topCustomers = Object.entries(customers).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const extrasTotal = extras.overweight + extras.extra_days + extras.other;
    const avgTicket = salesCount > 0 ? collected / salesCount : 0;
    return {
      collected, refunds, sellers, sizes, units: unitRows.length, change, topCustomers,
      extras, extrasTotal, salesCount, avgTicket, newMoney, repeatMoney, newCount, repeatCount,
    };
  }, [tx, prevCollected, unitRows, priorNames, defaultSeller]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  }

  const sellerEntries = Object.entries(report.sellers).sort((a, b) => b[1] - a[1]);
  const SELLER_COLORS = ['#FFCD11', '#3B82F6', '#16A34A', '#9333EA', '#F97316', '#9CA3AF'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A', flex: 1 }}>Sales</Text>
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
          {/* Total */}
          <View style={{ backgroundColor: '#14213D', borderRadius: 14, padding: 18, marginBottom: 18 }}>
            <Text style={{ color: '#9fb0d0', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Total sales · collected
            </Text>
            <Text style={{ color: '#FFCD11', fontSize: 34, fontWeight: '800', marginTop: 4 }}>
              {fmt(report.collected)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
              {report.change !== null && (
                <Text style={{ color: report.change >= 0 ? '#85cfff' : '#ffb4ab', fontWeight: '700', fontSize: 12 }}>
                  {report.change >= 0 ? '▲ +' : '▼ '}{report.change.toFixed(1)}% vs same days last month
                </Text>
              )}
              {report.refunds !== 0 && (
                <Text style={{ color: '#ffb4ab', fontWeight: '700', fontSize: 12 }}>
                  refunds -{fmt(report.refunds)}
                </Text>
              )}
            </View>
          </View>

          {/* Who sold it — Online bookings + every seller (Asai, Tiago, and any
              seller a provider registers shows up here automatically) */}
          <Section title="Who sold it">
            {sellerEntries.map(([who, cents], i) => (
              <Bar
                key={who}
                label={who}
                cents={cents}
                total={report.collected}
                color={SELLER_COLORS[i % SELLER_COLORS.length]}
              />
            ))}
          </Section>

          {/* Owner numbers at a glance */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            <View style={{ flexGrow: 1, minWidth: '30%', backgroundColor: '#F7F7F7', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#666' }}>Sales</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1A1A1A' }}>{report.salesCount}</Text>
            </View>
            <View style={{ flexGrow: 1, minWidth: '30%', backgroundColor: '#F7F7F7', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#666' }}>Avg ticket</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1A1A1A' }}>{fmt(report.avgTicket)}</Text>
            </View>
            <View style={{ flexGrow: 1, minWidth: '30%', backgroundColor: '#F7F7F7', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#666' }}>New vs repeat</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A' }}>
                {report.newCount} new · {report.repeatCount} repeat
              </Text>
              <Text style={{ fontSize: 11, color: '#888' }}>
                {fmt(report.newMoney)} / {fmt(report.repeatMoney)}
              </Text>
            </View>
          </View>

          {/* Extra charges */}
          <Section title={`Extra charges: ${fmt(report.extrasTotal)}`}>
            {report.extrasTotal === 0 ? (
              <Text style={{ color: '#888' }}>No extra charges collected this month.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'Overweight', v: report.extras.overweight },
                  { label: 'Extra days', v: report.extras.extra_days },
                  { label: 'Other fees', v: report.extras.other },
                ].filter((e) => e.v > 0).map((e) => (
                  <View key={e.label} style={{ backgroundColor: '#FFF8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minWidth: 100, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#8a6d00' }}>{fmt(e.v)}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#8a6d00' }}>{e.label}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={{ color: '#999', fontSize: 11, marginTop: 6 }}>
              Money recovered on top of the rental price — straight from the invoice lines.
            </Text>
          </Section>

          {/* What sold, with its money */}
          <Section title={`Dumpsters out this month: ${report.units}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(report.sizes).sort().map(([size, info]) => (
                <View key={size} style={{ backgroundColor: '#F7F7F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minWidth: 104, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>{info.n}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>{size}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#16A34A', marginTop: 2 }}>{fmt(info.cents)}</Text>
                </View>
              ))}
              {report.units === 0 && (
                <Text style={{ color: '#888' }}>No deliveries scheduled this month.</Text>
              )}
            </View>
          </Section>

          {/* Star customers */}
          <Section title="Star customers">
            {report.topCustomers.length === 0 && (
              <Text style={{ color: '#888' }}>No customer data yet this month.</Text>
            )}
            {report.topCustomers.map(([name, cents], i) => (
              <View key={name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                <Text style={{ width: 24, color: '#FFCD11', fontWeight: '800', fontSize: 14 }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontWeight: '700', color: '#1A1A1A', fontSize: 13 }} numberOfLines={1}>{name}</Text>
                <Text style={{ fontWeight: '800', fontSize: 14, color: '#1A1A1A' }}>{fmt(cents)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push('/payments')} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 13 }}>
                See every payment & full customer ranking →
              </Text>
            </TouchableOpacity>
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
