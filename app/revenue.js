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
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState([]);
  const [prevCollected, setPrevCollected] = useState(null);
  const [unitRows, setUnitRows] = useState([]);

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

    // Units delivered this month, by size (operational truth from bookings).
    const cid = await getCompanyId();
    if (cid) {
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const nextStart = month === 11
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 2).padStart(2, '0')}-01`;
      const { data: units } = await supabase
        .from('bookings')
        .select('dumpster_size, service_type')
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
    let collected = 0, refunds = 0;
    const source = { online: 0, phone: 0, direct: 0 };
    const reps = {};
    const customers = {};
    for (const r of tx) {
      const a = r.amount_cents || 0;
      if (r.category === 'refund' || r.category === 'chargeback') { refunds += a; collected += a; continue; }
      if (a <= 0) continue;
      collected += a;
      const b = r.bookings;
      if (b?.source === 'website') source.online += a;
      else if (b) source.phone += a;
      else source.direct += a;
      const rep = b?.sales_rep;
      if (rep) reps[rep] = (reps[rep] || 0) + a;
      const name = r.metadata?.customer_name;
      if (name) customers[name] = (customers[name] || 0) + a;
    }
    const change = prevCollected > 0 ? ((collected - prevCollected) / prevCollected) * 100 : null;
    const sizes = {};
    for (const u of unitRows) {
      const key = `${u.dumpster_size || '?'}yd`;
      sizes[key] = (sizes[key] || 0) + 1;
    }
    const topCustomers = Object.entries(customers).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { collected, refunds, source, reps, sizes, units: unitRows.length, change, topCustomers };
  }, [tx, prevCollected, unitRows]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  }

  const sourceTotal = report.source.online + report.source.phone + report.source.direct;
  const repNames = Object.entries(report.reps).sort((a, b) => b[1] - a[1]);

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

          {/* Where it came from */}
          <Section title="Where it came from">
            <Bar label="Online bookings" cents={report.source.online} total={sourceTotal} color="#3B82F6" />
            <Bar label="Phone / in-app" cents={report.source.phone} total={sourceTotal} color="#FFCD11" />
            <Bar label="Direct invoices" cents={report.source.direct} total={sourceTotal} color="#9CA3AF" />
          </Section>

          {/* By seller (only when reps exist) */}
          {repNames.length > 0 && (
            <Section title="By seller">
              {repNames.map(([rep, cents]) => (
                <Bar
                  key={rep}
                  label={rep.charAt(0).toUpperCase() + rep.slice(1)}
                  cents={cents}
                  total={report.collected}
                  color="#16A34A"
                />
              ))}
              <Text style={{ color: '#999', fontSize: 11 }}>
                Only payments linked to a booking with a seller are counted here.
              </Text>
            </Section>
          )}

          {/* What sold */}
          <Section title={`Dumpsters out this month: ${report.units}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(report.sizes).sort().map(([size, n]) => (
                <View key={size} style={{ backgroundColor: '#F7F7F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minWidth: 90, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>{n}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>{size}</Text>
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
