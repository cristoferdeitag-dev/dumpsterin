import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { supabase } from '../../src/lib/supabase';

// Bay Area ZIP codes served by TP Dumpsters
const SERVICE_ZIPS = {
  // Oakland
  '94601': 'Oakland', '94602': 'Oakland', '94603': 'Oakland', '94605': 'Oakland', '94606': 'Oakland', '94607': 'Oakland', '94608': 'Oakland', '94609': 'Oakland', '94610': 'Oakland', '94611': 'Oakland', '94612': 'Oakland', '94613': 'Oakland', '94618': 'Oakland', '94619': 'Oakland', '94621': 'Oakland',
  // Berkeley
  '94702': 'Berkeley', '94703': 'Berkeley', '94704': 'Berkeley', '94705': 'Berkeley', '94706': 'Berkeley / Albany', '94707': 'Berkeley', '94708': 'Berkeley', '94709': 'Berkeley', '94710': 'Berkeley',
  // Richmond
  '94801': 'Richmond', '94803': 'Richmond', '94804': 'Richmond', '94805': 'Richmond', '94806': 'Richmond',
  // San Francisco
  '94102': 'San Francisco', '94103': 'San Francisco', '94104': 'San Francisco', '94105': 'San Francisco', '94107': 'San Francisco', '94108': 'San Francisco', '94109': 'San Francisco', '94110': 'San Francisco', '94111': 'San Francisco', '94112': 'San Francisco', '94114': 'San Francisco', '94115': 'San Francisco', '94116': 'San Francisco', '94117': 'San Francisco', '94118': 'San Francisco', '94121': 'San Francisco', '94122': 'San Francisco', '94123': 'San Francisco', '94124': 'San Francisco', '94127': 'San Francisco', '94129': 'San Francisco', '94130': 'San Francisco', '94131': 'San Francisco', '94132': 'San Francisco', '94133': 'San Francisco', '94134': 'San Francisco',
  // Pinole
  '94564': 'Pinole',
  // El Cerrito / San Pablo
  '94530': 'El Cerrito',
  // Hercules / Rodeo
  '94547': 'Hercules', '94572': 'Rodeo',
  // Vallejo
  '94589': 'Vallejo', '94590': 'Vallejo', '94591': 'Vallejo', '94592': 'Vallejo',
  // Concord
  '94518': 'Concord', '94519': 'Concord', '94520': 'Concord', '94521': 'Concord',
  // Walnut Creek
  '94595': 'Walnut Creek', '94596': 'Walnut Creek', '94597': 'Walnut Creek', '94598': 'Walnut Creek',
  // Pleasant Hill / Martinez
  '94523': 'Pleasant Hill', '94553': 'Martinez',
  // Hayward
  '94541': 'Hayward', '94542': 'Hayward', '94544': 'Hayward', '94545': 'Hayward',
  // Fremont
  '94536': 'Fremont', '94538': 'Fremont', '94539': 'Fremont', '94555': 'Fremont',
  // San Leandro
  '94577': 'San Leandro', '94578': 'San Leandro', '94579': 'San Leandro',
  // Castro Valley
  '94546': 'Castro Valley',
  // Union City
  '94587': 'Union City',
  // Napa
  '94558': 'Napa', '94559': 'Napa',
  // Santa Rosa
  '95401': 'Santa Rosa', '95402': 'Santa Rosa', '95403': 'Santa Rosa', '95404': 'Santa Rosa', '95405': 'Santa Rosa', '95407': 'Santa Rosa', '95409': 'Santa Rosa',
  // Vacaville / Fairfield
  '94533': 'Fairfield', '94534': 'Fairfield', '95687': 'Vacaville', '95688': 'Vacaville',
  // San Rafael / Novato
  '94901': 'San Rafael', '94903': 'San Rafael', '94945': 'Novato', '94947': 'Novato', '94949': 'Novato',
  // Petaluma
  '94952': 'Petaluma', '94954': 'Petaluma',
  // Millbrae / San Bruno
  '94010': 'Millbrae', '94066': 'San Bruno',
  // Orinda / Lafayette
  '94549': 'Lafayette', '94563': 'Orinda',
  // Knightsen
  '94548': 'Knightsen',
  // Milpitas
  '95035': 'Milpitas',
};

const STATUS_COLORS = {
  scheduled: '#60a5fa',
  in_transit: '#FFE066',
  delivered: '#999999',
  pickup_ready: '#00b5fc',
  picked_up: '#85cfff',
  completed: '#999999',
  cancelled: '#ffb4ab',
};

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useApp();
  const { bookings, dumpsters } = state;
  const [zipCode, setZipCode] = useState('');
  const [zipResult, setZipResult] = useState(null); // null, false, or city name string
  // Hide/show toggle for the revenue figure on Home (Asaí 2026-04-30: bank-app
  // pattern — useful in the field when looking at the screen with customers).
  const [hideRevenue, setHideRevenue] = useState(false);

  // Money ACTUALLY collected in Stripe (the transactions ledger) — Cris
  // 2026-06-11: the headline number must be cash in, not service delivered.
  // MoM compares against the same day-range of the previous month.
  const [ledger, setLedger] = useState({ collected: null, change: null, card: 0, oob: 0, refunds: 0, review: 0 });
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const currentMonth = today.slice(0, 7);
      const [y, m] = currentMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const prevFrom = `${prevMonth}-01`;
      const prevTo = `${prevMonth}-${today.slice(8, 10)}T23:59:59Z`;

      const { data: cur } = await supabase
        .from('transactions')
        .select('amount_cents, category, metadata')
        .gte('occurred_at', `${currentMonth}-01`);
      const { data: prev } = await supabase
        .from('transactions')
        .select('amount_cents')
        .gte('occurred_at', prevFrom)
        .lte('occurred_at', prevTo);

      const sum = (rows) => (rows || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
      const collected = sum(cur);
      const prevCollected = sum(prev);
      let card = 0, oob = 0, refunds = 0, review = 0;
      for (const r of cur || []) {
        if (r.category === 'refund' || r.category === 'chargeback') refunds += r.amount_cents || 0;
        else if (r.category === 'provider_invoice_oob_payment') oob += r.amount_cents || 0;
        else if ((r.amount_cents || 0) > 0) card += r.amount_cents || 0;
        if (r.metadata?.needs_review) review += 1;
      }
      setLedger({
        collected,
        change: prevCollected > 0 ? ((collected - prevCollected) / prevCollected) * 100 : null,
        card, oob, refunds, review,
      });
    })();
  }, [bookings]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7); // YYYY-MM

    // Previous calendar month, in YYYY-MM form.
    const [y, m] = currentMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1); // m is 1-indexed, JS Date is 0-indexed; -2 = prev month
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    // Fair month-over-month: compare June 1-11 against May 1-11, not against
    // the FULL previous month (which showed a scary -79% every month-start).
    const prevMonthSameDay = `${prevMonth}-${today.slice(8, 10)}`;

    const isCounted = b => b.status !== 'cancelled';
    const monthBookings = bookings.filter(b => isCounted(b) && (b.deliveryDate || '') >= currentMonth + '-01' && (b.deliveryDate || '') <= today);
    const prevMonthBookings = bookings.filter(b => isCounted(b) && (b.deliveryDate || '') >= prevMonth + '-01' && (b.deliveryDate || '') <= prevMonthSameDay);

    const totalRevenue = monthBookings.reduce((sum, b) => sum + (b.total || 0), 0);
    const prevRevenue = prevMonthBookings.reduce((sum, b) => sum + (b.total || 0), 0);

    // Real month-over-month change. null when there's no previous data to compare.
    let revenueChange = null;
    if (prevRevenue > 0) {
      revenueChange = ((totalRevenue - prevRevenue) / prevRevenue) * 100;
    } else if (totalRevenue > 0) {
      revenueChange = 100; // anything-from-zero → show as +100%
    }

    // Revenue by sales rep — uses sales_rep (b.generatedBy in app shape).
    // Falls back to 'unknown' rather than treating source='phone' as Asaí,
    // which silently misattributed Tiago's phone sales pre-2026-05.
    const repRevenue = {};
    monthBookings.forEach(b => {
      const rep = b.generatedBy || (b.source === 'website' ? 'website' : 'unknown');
      if (!repRevenue[rep]) repRevenue[rep] = 0;
      repRevenue[rep] += b.total || 0;
    });

    const activeBookings = bookings.filter(b => !['completed', 'cancelled'].includes(b.status));
    const completedBookings = bookings.filter(b => b.status === 'completed');
    const availableUnits = dumpsters.filter(d => d.status === 'available').length;
    const deployedUnits = dumpsters.filter(d => d.status === 'deployed').length;
    const maintenanceUnits = dumpsters.filter(d => d.status === 'maintenance').length;
    const totalUnits = dumpsters.length;
    const availablePercent = totalUnits > 0 ? (availableUnits / totalUnits) * 100 : 0;

    return {
      totalRevenue,
      prevRevenue,
      activeCount: activeBookings.length,
      completedCount: completedBookings.length,
      availableUnits,
      deployedUnits,
      maintenanceUnits,
      totalUnits,
      availablePercent,
      revenueChange,
      repRevenue,
    };
  }, [bookings, dumpsters]);

  const recentBookings = useMemo(() => {
    return [...bookings]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);
  }, [bookings]);

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{
              color: '#1A1A1A',
              fontSize: 32,
              fontWeight: '800',
              letterSpacing: -0.5,
              marginBottom: 4,
            }}>
              Fleet Overview
            </Text>
            <Text style={{ color: '#666666', fontWeight: '500', fontSize: 14 }}>
              Real-time logistics and revenue tracking
            </Text>
          </View>
          {/* Notas shortcut — added 2026-04-30 per Asaí's request for a single
              place to dump quick todos that today get lost in Telegram. */}
          <TouchableOpacity
            onPress={() => router.push('/notes')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 9999,
              backgroundColor: '#F7F7F7',
              borderWidth: 1,
              borderColor: '#E8E8E8',
            }}
          >
            <Ionicons name="document-text-outline" size={16} color="#1A1A1A" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>Notes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/payments')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 9999,
              backgroundColor: '#F7F7F7',
              borderWidth: 1,
              borderColor: '#E8E8E8',
              marginLeft: 6,
            }}
          >
            <Ionicons name="card-outline" size={16} color="#1A1A1A" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>Payments</Text>
          </TouchableOpacity>
        </View>

        {/* Service Area Check moved to the Map tab — Asaí 2026-04-30 */}

        {/* Revenue Card — compact (Asaí 2026-04-30): smaller height, hide/show
            eye toggle, tap-anywhere-else opens /revenue. The chevron makes the
            tap-to-drill-down obvious. */}
        <View style={{
          backgroundColor: '#F7F7F7',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={() => router.push('/revenue')}
              activeOpacity={0.7}
              style={{ flex: 1 }}
            >
              <Text style={{ color: '#666666', fontSize: 10, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                Collected in Stripe · this month
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ color: '#FFE066', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>
                  {hideRevenue ? '••••••' : ledger.collected === null ? '…' : formatCurrency(ledger.collected / 100)}
                </Text>
                {!hideRevenue && ledger.change !== null && (
                  <Text style={{
                    color: ledger.change >= 0 ? '#85cfff' : '#ffb4ab',
                    fontWeight: '700',
                    fontSize: 12,
                  }}>
                    {ledger.change >= 0 ? '+' : ''}{ledger.change.toFixed(1)}% vs same days last month
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setHideRevenue((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              <Ionicons name={hideRevenue ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999999" />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: '#E8E8E8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: '#666666', fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Active</Text>
              <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '800', marginTop: 2 }}>{stats.activeCount}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#E8E8E8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: '#666666', fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Completed</Text>
              <Text style={{ color: '#85cfff', fontSize: 16, fontWeight: '800', marginTop: 2 }}>{stats.completedCount}</Text>
            </View>
          </View>
        </View>

        {/* Money channels — straight from the Stripe-fed ledger, same buckets
            as the Payments screen. Tap any chip to drill in. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }} style={{ marginBottom: 12, marginHorizontal: -16, paddingHorizontal: 16 }}>
          {[
            { key: 'card', label: 'Card', value: ledger.card, color: '#FFCD11' },
            { key: 'oob', label: 'Cash/Zelle', value: ledger.oob, color: '#16A34A' },
            { key: 'refunds', label: 'Refunds', value: ledger.refunds, color: '#C00000' },
          ].map((c) => (
            <TouchableOpacity key={c.key} onPress={() => router.push('/payments')} style={{ minWidth: 110, backgroundColor: '#F7F7F7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ color: '#999999', fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                {c.label}
              </Text>
              <Text style={{ color: c.color, fontSize: 16, fontWeight: '800', marginTop: 2 }}>
                {hideRevenue ? '••••' : formatCurrency(Math.abs(c.value) / 100)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Fleet Status — Fleet Readiness + Live Unit Tracking merged into a
            single compact card (Asaí 2026-04-30). Header + 3 status cells +
            tappable row to open the map. */}
        <View style={{
          backgroundColor: '#EEEEEE',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 }}>
              Fleet Status
            </Text>
            <Text style={{ color: '#666666', fontSize: 11 }}>
              {stats.deployedUnits} live in service area
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{ width: '100%', height: 5, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
            <View style={{
              width: `${stats.availablePercent}%`,
              height: '100%',
              backgroundColor: '#85cfff',
              borderRadius: 3,
            }} />
          </View>

          {/* 3-up status row */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: '#666666', fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Available</Text>
              <Text style={{ color: '#85cfff', fontSize: 18, fontWeight: '800', marginTop: 2 }}>{stats.availableUnits}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: '#666666', fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Deployed</Text>
              <Text style={{ color: '#FFE066', fontSize: 18, fontWeight: '800', marginTop: 2 }}>{stats.deployedUnits}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: '#666666', fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Service</Text>
              <Text style={{ color: '#ffb4ab', fontSize: 18, fontWeight: '800', marginTop: 2 }}>{stats.maintenanceUnits}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/map')}
            style={{
              backgroundColor: '#FFCD11',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={16} color="#4d2600" />
            <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 13 }}>
              Open Fleet Map
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pending Reviews + Recent Bookings removed per Asaí 2026-04-30.
            Pending Reviews now lives inside the "Ready for pickup" filter on
            the Bookings tab; Recent Bookings is redundant with that tab. */}

        {/* Recent Bookings — REMOVED */}
        <View style={{ marginBottom: 16, display: 'none' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{
              color: '#1A1A1A',
              fontSize: 16,
              fontWeight: '800',
              letterSpacing: -0.5,
            }}>
              Recent Bookings
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/bookings')}>
              <Text style={{
                color: '#FFCD11',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}>
                View All
              </Text>
            </TouchableOpacity>
          </View>

          {recentBookings.map((booking) => {
            const borderColor = STATUS_COLORS[booking.status] || '#999999';
            return (
              <TouchableOpacity
                key={booking.id}
                onPress={() => router.push(`/booking/${booking.id}`)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: '#E8E8E8',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 10,
                  borderLeftWidth: 4,
                  borderLeftColor: borderColor,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <View>
                    <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '800' }}>
                      {booking.customerName}
                    </Text>
                    <Text style={{ color: '#666666', fontSize: 12, marginTop: 2 }}>
                      {booking.dumpsterSize ? `${booking.dumpsterSize.replace('yd', '')}-Yard Dumpster` : 'Dumpster'}
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: `${borderColor}20`,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 9999,
                  }}>
                    <Text style={{
                      color: borderColor,
                      fontSize: 9,
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {(booking.status || '').replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="location-outline" size={12} color="#666666" />
                  <Text style={{ color: '#666666', fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                    {booking.deliveryAddress}
                  </Text>
                </View>

                <View style={{
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(86, 67, 52, 0.1)',
                  paddingTop: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <Text style={{ color: '#FFE066', fontWeight: '700', fontSize: 15 }}>
                    ${booking.total?.toFixed(2)}
                  </Text>
                  <Text style={{
                    color: '#666666',
                    fontSize: 10,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                  }}>
                    {booking.deliveryDate || booking.createdAt}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
