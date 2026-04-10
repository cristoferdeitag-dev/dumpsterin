import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
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
  all: 'All',
  scheduled: 'Scheduled',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  pickup_ready: 'Pickup Ready',
  picked_up: 'Picked Up',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const FILTER_KEYS = [
  'all',
  'scheduled',
  'in_transit',
  'delivered',
  'pickup_ready',
  'picked_up',
  'completed',
  'cancelled',
];

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0';
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BookingsScreen() {
  const router = useRouter();
  const { state } = useApp();
  const bookings = state.bookings || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredBookings = useMemo(() => {
    let result = bookings;

    // Apply status filter
    if (activeFilter !== 'all') {
      result = result.filter((b) => b.status === activeFilter);
    }

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (b) =>
          (b.customerName && b.customerName.toLowerCase().includes(q)) ||
          (b.id && String(b.id).toLowerCase().includes(q)) ||
          (b.deliveryAddress && b.deliveryAddress.toLowerCase().includes(q))
      );
    }

    // Sort by most recent first
    return [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [bookings, activeFilter, searchQuery]);

  const renderFilterTab = useCallback(
    ({ item }) => {
      const isActive = activeFilter === item;
      return (
        <TouchableOpacity
          style={[
            styles.filterTab,
            isActive ? styles.filterTabActive : styles.filterTabInactive,
          ]}
          activeOpacity={0.7}
          onPress={() => setActiveFilter(item)}
        >
          <Text
            style={[
              styles.filterTabText,
              isActive ? styles.filterTabTextActive : styles.filterTabTextInactive,
            ]}
          >
            {STATUS_LABELS[item]}
          </Text>
        </TouchableOpacity>
      );
    },
    [activeFilter]
  );

  const renderBookingCard = useCallback(
    ({ item: booking }) => (
      <TouchableOpacity
        style={styles.bookingCard}
        activeOpacity={0.7}
        onPress={() => router.push(`/booking/${booking.id}`)}
      >
        {/* Top Row: ID + Status */}
        <View style={styles.cardTopRow}>
          <Text style={styles.bookingId}>#{booking.id}</Text>
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

        {/* Customer Name */}
        <Text style={styles.customerName} numberOfLines={1}>
          {booking.customerName}
        </Text>

        {/* Address */}
        <Text style={styles.address} numberOfLines={1}>
          <Ionicons name="location-outline" size={12} color={colors.textSecondary} />{' '}
          {booking.deliveryAddress}
        </Text>

        {/* Bottom Row: Size, Date, Price */}
        <View style={styles.cardBottomRow}>
          <View style={styles.cardDetail}>
            <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
            <Text style={styles.cardDetailText}>{booking.dumpsterSize}</Text>
          </View>
          <View style={styles.cardDetail}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.cardDetailText}>{formatDate(booking.deliveryDate)}</Text>
          </View>
          <Text style={styles.cardPrice}>{formatCurrency(booking.total)}</Text>
        </View>
      </TouchableOpacity>
    ),
    [router]
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No bookings found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery ? 'Try adjusting your search or filters' : 'No bookings match this filter'}
        </Text>
      </View>
    ),
    [searchQuery]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Bookings</Text>
        <Text style={styles.countLabel}>{filteredBookings.length} total</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ID, or address..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filtersContainer}>
        <FlatList
          data={FILTER_KEYS}
          renderItem={renderFilterTab}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersList}
        />
      </View>

      {/* Bookings List */}
      <FlatList
        data={filteredBookings}
        renderItem={renderBookingCard}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={ListEmptyComponent}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push('/booking/create')}
      >
        <Ionicons name="add" size={28} color={colors.text} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  countLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: colors.text,
  },
  clearBtn: {
    padding: 4,
  },
  filtersContainer: {
    marginBottom: 8,
  },
  filtersList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 0,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabInactive: {
    backgroundColor: colors.bgElevated,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: colors.text,
  },
  filterTabTextInactive: {
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  bookingCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookingId: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
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
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  address: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 16,
  },
  cardDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDetailText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
    marginLeft: 'auto',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
});
