import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import colors from '../../src/theme/colors';

const STATUS_COLORS = {
  scheduled: colors.status.scheduled,
  in_transit: colors.status.in_transit,
  delivered: colors.status.delivered,
  pickup_ready: colors.status.pickup_ready,
  picked_up: colors.status.picked_up,
  completed: colors.status.completed,
  cancelled: colors.status.cancelled,
};

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  pickup_ready: 'Pickup Ready',
  picked_up: 'Picked Up',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0';
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useApp();
  const bookings = state.bookings || [];
  const dumpsters = state.dumpsters || [];

  const stats = useMemo(() => {
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.total || 0), 0);
    const activeBookings = bookings.filter(
      (b) => b.status !== 'completed' && b.status !== 'cancelled'
    ).length;
    const completedCount = bookings.filter((b) => b.status === 'completed').length;
    const availableFleet = dumpsters.filter((d) => d.status === 'available').length;
    return { totalRevenue, activeBookings, completedCount, availableFleet };
  }, [bookings, dumpsters]);

  const recentBookings = useMemo(() => {
    return [...bookings]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [bookings]);

  const fleetCounts = useMemo(() => {
    const counts = { available: 0, deployed: 0, maintenance: 0 };
    dumpsters.forEach((d) => {
      if (d.status === 'available') counts.available++;
      else if (d.status === 'deployed') counts.deployed++;
      else if (d.status === 'maintenance') counts.maintenance++;
    });
    return counts;
  }, [dumpsters]);

  const statCards = [
    {
      icon: 'cash-outline',
      value: formatCurrency(stats.totalRevenue),
      label: 'Total Revenue',
      color: colors.success,
    },
    {
      icon: 'calendar-outline',
      value: stats.activeBookings,
      label: 'Active Bookings',
      color: colors.primary,
    },
    {
      icon: 'cube-outline',
      value: stats.availableFleet,
      label: 'Fleet Available',
      color: colors.info,
    },
    {
      icon: 'checkmark-circle-outline',
      value: stats.completedCount,
      label: 'Completed',
      color: colors.success,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>TP Dumpsters</Text>
          <Text style={styles.title}>Business Dashboard</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {statCards.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: stat.color + '1A' }]}>
                <Ionicons name={stat.icon} size={22} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Fleet Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fleet Status</Text>
          <View style={styles.fleetRow}>
            <View style={[styles.fleetBadge, { backgroundColor: colors.success + '20' }]}>
              <View style={[styles.fleetDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.fleetText, { color: colors.success }]}>
                {fleetCounts.available} Available
              </Text>
            </View>
            <View style={[styles.fleetBadge, { backgroundColor: colors.warning + '20' }]}>
              <View style={[styles.fleetDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.fleetText, { color: colors.warning }]}>
                {fleetCounts.deployed} Deployed
              </Text>
            </View>
            <View style={[styles.fleetBadge, { backgroundColor: colors.danger + '20' }]}>
              <View style={[styles.fleetDot, { backgroundColor: colors.danger }]} />
              <Text style={[styles.fleetText, { color: colors.danger }]}>
                {fleetCounts.maintenance} Maintenance
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Bookings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Bookings</Text>
          {recentBookings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No bookings yet</Text>
            </View>
          ) : (
            recentBookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/booking/${booking.id}`)}
              >
                <View style={styles.bookingHeader}>
                  <Text style={styles.bookingName} numberOfLines={1}>
                    {booking.customerName}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: (STATUS_COLORS[booking.status] || colors.textMuted) + '20' },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: STATUS_COLORS[booking.status] || colors.textMuted },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: STATUS_COLORS[booking.status] || colors.textMuted },
                      ]}
                    >
                      {STATUS_LABELS[booking.status] || booking.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.bookingAddress} numberOfLines={1}>
                  {booking.deliveryAddress}
                </Text>
                <View style={styles.bookingFooter}>
                  <Text style={styles.bookingSize}>{booking.dumpsterSize}</Text>
                  <Text style={styles.bookingDate}>{formatDate(booking.deliveryDate)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
    marginTop: 8,
  },
  companyName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  fleetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fleetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  fleetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fleetText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bookingCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bookingName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  bookingAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingSize: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  bookingDate: {
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
  },
});
