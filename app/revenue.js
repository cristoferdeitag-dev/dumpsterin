import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';

// Design system — "Industrial Sophistication"
const C = {
  surface: '#FFFFFF',
  surfaceLow: '#F7F7F7',
  surfaceHigh: '#EEEEEE',
  surfaceHighest: '#E8E8E8',
  surfaceLowest: '#F0F0F0',
  primary: '#ffb77d',
  primaryContainer: '#ff8c00',
  onPrimary: '#4d2600',
  onSurface: '#1A1A1A',
  onSurfaceVariant: '#666666',
  tertiary: '#85cfff',
  error: '#ffb4ab',
};

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(part, total) {
  if (!total) return '0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

function getWeekOfMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  return Math.ceil(day / 7);
}

const DATE_FILTERS = [
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

function getDateRange(filterId) {
  const now = new Date();
  switch (filterId) {
    case 'this_week': {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
    }
    case 'this_month':
      return { start: now.toISOString().slice(0, 7) + '-01', end: now.toISOString().slice(0, 10) };
    case 'last_month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: lm.toISOString().slice(0, 10), end: lmEnd.toISOString().slice(0, 10) };
    }
    case 'all':
      return { start: '2000-01-01', end: '2099-12-31' };
    default:
      return { start: '2000-01-01', end: '2099-12-31' };
  }
}

export default function RevenueScreen() {
  const router = useRouter();
  const { state } = useApp();
  const bookings = state.bookings || [];

  const [dateFilter, setDateFilter] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showStartCal, setShowStartCal] = useState(false);
  const [showEndCal, setShowEndCal] = useState(false);

  const now = new Date();
  const currentYM = now.toISOString().slice(0, 7);

  const stats = useMemo(() => {
    const range = dateFilter === 'custom'
      ? { start: customStart || '2000-01-01', end: customEnd || '2099-12-31' }
      : getDateRange(dateFilter);

    const completed = bookings.filter(
      (b) => b.status !== 'cancelled' && (b.deliveryDate || '') >= range.start && (b.deliveryDate || '') <= range.end
    );
    const totalRevenue = completed.reduce((s, b) => s + (b.total || 0), 0);
    const thisMonth = completed.filter((b) => (b.deliveryDate || '').startsWith(currentYM));
    const monthRevenue = thisMonth.reduce((s, b) => s + (b.total || 0), 0);
    const completedOnly = bookings.filter((b) => b.status === 'completed');
    const completedRevenue = completedOnly.reduce((s, b) => s + (b.total || 0), 0);
    const avgValue = completed.length ? totalRevenue / completed.length : 0;

    // Revenue by sales rep (generatedBy field, fallback to source)
    const repMap = {};
    completed.forEach((b) => {
      const rep = b.generatedBy || b.source || 'unknown';
      if (!repMap[rep]) repMap[rep] = { name: rep, revenue: 0, count: 0 };
      repMap[rep].revenue += b.total || 0;
      repMap[rep].count += 1;
    });
    const byRep = Object.values(repMap).sort((a, b) => b.revenue - a.revenue);

    // Revenue by service type
    const svcMap = {};
    completed.forEach((b) => {
      const svc = b.serviceType || 'Other';
      if (!svcMap[svc]) svcMap[svc] = { name: svc, revenue: 0, count: 0 };
      svcMap[svc].revenue += b.total || 0;
      svcMap[svc].count += 1;
    });
    const byService = Object.values(svcMap).sort((a, b) => b.revenue - a.revenue);

    // Revenue by dumpster size
    const sizeMap = {};
    completed.forEach((b) => {
      const sz = b.dumpsterSize || 'Unknown';
      if (!sizeMap[sz]) sizeMap[sz] = { name: sz, revenue: 0, count: 0 };
      sizeMap[sz].revenue += b.total || 0;
      sizeMap[sz].count += 1;
    });
    const bySize = Object.values(sizeMap).sort((a, b) => b.revenue - a.revenue);

    // Top customers
    const custMap = {};
    completed.forEach((b) => {
      const name = b.customerName || 'Unknown';
      if (!custMap[name]) custMap[name] = { name, revenue: 0, count: 0 };
      custMap[name].revenue += b.total || 0;
      custMap[name].count += 1;
    });
    const topCustomers = Object.values(custMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Monthly trend — revenue per week of current month
    const weekMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    thisMonth.forEach((b) => {
      const w = getWeekOfMonth(b.deliveryDate);
      weekMap[w] = (weekMap[w] || 0) + (b.total || 0);
    });
    // Only include weeks that exist (up to 5)
    const weeklyTrend = [];
    for (let i = 1; i <= 5; i++) {
      if (weekMap[i] !== undefined) {
        weeklyTrend.push({ week: `W${i}`, revenue: weekMap[i] });
      }
    }

    return {
      totalRevenue,
      monthRevenue,
      completedCount: completedOnly.length,
      completedRevenue,
      avgValue,
      byRep,
      byService,
      bySize,
      topCustomers,
      weeklyTrend,
    };
  }, [bookings, currentYM]);

  const maxRepRevenue = stats.byRep.length ? stats.byRep[0].revenue : 1;
  const maxSvcRevenue = stats.byService.length ? stats.byService[0].revenue : 1;
  const maxSizeRevenue = stats.bySize.length ? stats.bySize[0].revenue : 1;
  const maxWeekRevenue = Math.max(...stats.weeklyTrend.map((w) => w.revenue), 1);

  const repLabel = (name) => {
    const labels = {
      tiago: 'Tiago',
      asai: 'Asai',
      website: 'Website',
      phone: 'Phone',
    };
    return labels[name] || name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Revenue</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Date Filter */}
        <View style={{ marginBottom: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {DATE_FILTERS.map(f => (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setDateFilter(f.id)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999,
                    backgroundColor: dateFilter === f.id ? '#FF8C00' : '#F0F0F0',
                  }}
                >
                  <Text style={{
                    color: dateFilter === f.id ? '#FFFFFF' : '#666666',
                    fontSize: 13, fontWeight: dateFilter === f.id ? '700' : '500',
                  }}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {dateFilter === 'custom' && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setShowStartCal(true)}
                style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Ionicons name="calendar-outline" size={16} color={customStart ? '#FF8C00' : '#AAA'} />
                <Text style={{ fontSize: 14, color: customStart ? '#333' : '#AAA' }}>
                  {customStart || 'Start date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowEndCal(true)}
                style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Ionicons name="calendar-outline" size={16} color={customEnd ? '#FF8C00' : '#AAA'} />
                <Text style={{ fontSize: 14, color: customEnd ? '#333' : '#AAA' }}>
                  {customEnd || 'End date'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Start Date Calendar Modal */}
          <Modal visible={showStartCal} transparent animationType="fade">
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} activeOpacity={1} onPress={() => setShowStartCal(false)}>
              <View style={{ backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 400 }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E8E8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>Start Date</Text>
                  <TouchableOpacity onPress={() => setShowStartCal(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                </View>
                <Calendar
                  theme={{ selectedDayBackgroundColor: '#FF8C00', todayTextColor: '#FF8C00', arrowColor: '#FF8C00' }}
                  onDayPress={(day) => { setCustomStart(day.dateString); setShowStartCal(false); }}
                  markedDates={{ [customStart]: { selected: true, selectedColor: '#FF8C00' } }}
                />
              </View>
            </TouchableOpacity>
          </Modal>

          {/* End Date Calendar Modal */}
          <Modal visible={showEndCal} transparent animationType="fade">
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }} activeOpacity={1} onPress={() => setShowEndCal(false)}>
              <View style={{ backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 400 }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E8E8E8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>End Date</Text>
                  <TouchableOpacity onPress={() => setShowEndCal(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                </View>
                <Calendar
                  theme={{ selectedDayBackgroundColor: '#FF8C00', todayTextColor: '#FF8C00', arrowColor: '#FF8C00' }}
                  onDayPress={(day) => { setCustomEnd(day.dateString); setShowEndCal(false); }}
                  markedDates={{ [customEnd]: { selected: true, selectedColor: '#FF8C00' } }}
                  minDate={customStart || undefined}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* Summary Cards */}
        <View style={s.cardsRow}>
          <View style={[s.card, s.cardHalf]}>
            <Text style={s.cardLabel}>Total Revenue</Text>
            <Text style={s.cardValueBig}>{fmt(stats.totalRevenue)}</Text>
          </View>
          <View style={[s.card, s.cardHalf]}>
            <Text style={s.cardLabel}>This Month</Text>
            <Text style={s.cardValueBig}>{fmt(stats.monthRevenue)}</Text>
          </View>
        </View>
        <View style={s.cardsRow}>
          <View style={[s.card, s.cardHalf]}>
            <Text style={s.cardLabel}>Completed Bookings</Text>
            <Text style={s.cardValue}>{stats.completedCount}</Text>
          </View>
          <View style={[s.card, s.cardHalf]}>
            <Text style={s.cardLabel}>Avg Booking Value</Text>
            <Text style={s.cardValue}>{fmt(stats.avgValue)}</Text>
          </View>
        </View>

        {/* Revenue by Sales Rep */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Revenue by Sales Rep</Text>
          {stats.byRep.map((rep) => (
            <View key={rep.name} style={s.repRow}>
              <View style={s.repHeader}>
                <Text style={s.repName}>{repLabel(rep.name)}</Text>
                <Text style={s.repRevenue}>{fmt(rep.revenue)}</Text>
              </View>
              <View style={s.repMeta}>
                <Text style={s.repMetaText}>{rep.count} bookings</Text>
                <Text style={s.repMetaText}>{pct(rep.revenue, stats.totalRevenue)}</Text>
              </View>
              <View style={s.barBg}>
                <View
                  style={[
                    s.barFill,
                    { width: `${(rep.revenue / maxRepRevenue) * 100}%`, backgroundColor: C.primaryContainer },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Revenue by Service Type */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Revenue by Service Type</Text>
          {stats.byService.map((svc) => (
            <View key={svc.name} style={s.repRow}>
              <View style={s.repHeader}>
                <Text style={s.repName}>{svc.name}</Text>
                <Text style={s.repRevenue}>{fmt(svc.revenue)}</Text>
              </View>
              <Text style={s.repMetaText}>{svc.count} bookings</Text>
              <View style={s.barBg}>
                <View
                  style={[
                    s.barFill,
                    { width: `${(svc.revenue / maxSvcRevenue) * 100}%`, backgroundColor: C.tertiary },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Revenue by Dumpster Size */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Revenue by Dumpster Size</Text>
          {stats.bySize.map((sz) => (
            <View key={sz.name} style={s.repRow}>
              <View style={s.repHeader}>
                <Text style={s.repName}>{sz.name}</Text>
                <Text style={s.repRevenue}>{fmt(sz.revenue)}</Text>
              </View>
              <Text style={s.repMetaText}>{sz.count} bookings</Text>
              <View style={s.barBg}>
                <View
                  style={[
                    s.barFill,
                    { width: `${(sz.revenue / maxSizeRevenue) * 100}%`, backgroundColor: C.primary },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Top Customers */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Top 5 Customers</Text>
          {stats.topCustomers.map((cust, i) => (
            <View key={cust.name} style={s.customerRow}>
              <View style={s.customerRank}>
                <Text style={s.rankNum}>{i + 1}</Text>
              </View>
              <View style={s.customerInfo}>
                <Text style={s.customerName} numberOfLines={1}>{cust.name}</Text>
                <Text style={s.customerMeta}>{cust.count} booking{cust.count !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={s.customerRevenue}>{fmt(cust.revenue)}</Text>
            </View>
          ))}
        </View>

        {/* Monthly Trend */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Monthly Trend</Text>
          <Text style={s.trendSubtitle}>Revenue per week — {currentYM}</Text>
          <View style={s.chartContainer}>
            {stats.weeklyTrend.map((w) => (
              <View key={w.week} style={s.chartCol}>
                <Text style={s.chartVal}>{w.revenue > 0 ? fmt(w.revenue) : '-'}</Text>
                <View style={s.chartBarOuter}>
                  <View
                    style={[
                      s.chartBar,
                      {
                        height: maxWeekRevenue > 0 ? `${(w.revenue / maxWeekRevenue) * 100}%` : '0%',
                      },
                    ]}
                  />
                </View>
                <Text style={s.chartLabel}>{w.week}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceHigh,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.onSurface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Summary cards
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: C.surfaceLow,
    borderRadius: 14,
    padding: 16,
  },
  cardHalf: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 13,
    color: C.onSurfaceVariant,
    marginBottom: 6,
  },
  cardValueBig: {
    fontSize: 24,
    fontWeight: '800',
    color: C.primaryContainer,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: C.onSurface,
  },

  // Sections
  section: {
    marginTop: 24,
    backgroundColor: C.surfaceLow,
    borderRadius: 14,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.onSurface,
    marginBottom: 16,
  },

  // Rep rows
  repRow: {
    marginBottom: 16,
  },
  repHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  repName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.onSurface,
  },
  repRevenue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.primary,
  },
  repMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  repMetaText: {
    fontSize: 12,
    color: C.onSurfaceVariant,
    marginBottom: 6,
  },

  // Progress bars
  barBg: {
    height: 8,
    backgroundColor: C.surfaceHighest,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },

  // Top customers
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceHigh,
  },
  customerRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surfaceHighest,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNum: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  customerInfo: {
    flex: 1,
    marginRight: 8,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.onSurface,
  },
  customerMeta: {
    fontSize: 12,
    color: C.onSurfaceVariant,
    marginTop: 2,
  },
  customerRevenue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.primary,
  },

  // Monthly trend chart
  trendSubtitle: {
    fontSize: 12,
    color: C.onSurfaceVariant,
    marginBottom: 16,
    marginTop: -8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 180,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartVal: {
    fontSize: 10,
    color: C.onSurfaceVariant,
    marginBottom: 4,
    textAlign: 'center',
  },
  chartBarOuter: {
    flex: 1,
    width: 32,
    justifyContent: 'flex-end',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: C.surfaceHighest,
  },
  chartBar: {
    width: '100%',
    backgroundColor: C.primaryContainer,
    borderRadius: 6,
    minHeight: 2,
  },
  chartLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.onSurfaceVariant,
    marginTop: 6,
  },
});
