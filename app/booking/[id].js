import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { BOOKING_STATUSES } from '../../src/data/mockData';
import {
  bg,
  bgCard,
  bgElevated,
  border,
  primary,
  primaryLight,
  primaryDark,
  success,
  warning,
  danger,
  info,
  text as textColor,
  textSecondary,
  textMuted,
  status as statusColors,
} from '../../src/theme/colors';

const STATUS_FLOW = ['scheduled', 'in_transit', 'delivered', 'pickup_ready', 'picked_up', 'completed'];

export default function BookingDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { state, dispatch } = useApp();

  const booking = state.bookings.find((b) => b.id === id);

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking Detail</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={textMuted} />
          <Text style={styles.notFoundText}>Booking not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleStatusChange = (newStatus) => {
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { bookingId: id, status: newStatus } });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Booking',
      `Are you sure you want to delete booking ${booking.id}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'DELETE_BOOKING', payload: id });
            router.back();
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: () => handleStatusChange('cancelled'),
      },
    ]);
  };

  const getStatusColor = (s) => statusColors[s] || textMuted;

  const assignedDumpster = booking.dumpsterId
    ? state.dumpsters.find((d) => d.id === booking.dumpsterId)
    : null;

  const assignedDriver = booking.driverId
    ? state.drivers.find((d) => d.id === booking.driverId)
    : null;

  const specialItemsTotal = (booking.specialItems || []).reduce(
    (sum, item) => sum + (item.fee || 0) * (item.qty || 1),
    0
  );
  const total = (booking.basePrice || 0) - (booking.discount || 0) + specialItemsTotal;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Detail</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Booking ID */}
        <Text style={styles.bookingId}>#{booking.id}</Text>

        {/* Status Badge */}
        <View style={styles.statusSection}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
            <Text style={[styles.statusBadgeText, { color: getStatusColor(booking.status) }]}>
              {(BOOKING_STATUSES.find((s) => s.id === booking.status) || {}).label || booking.status}
            </Text>
          </View>
        </View>

        {/* Status Flow Buttons */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status Flow</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.statusFlow}>
              {STATUS_FLOW.map((s, idx) => {
                const isCurrent = booking.status === s;
                const statusLabel = (BOOKING_STATUSES.find((bs) => bs.id === s) || {}).label || s;
                const color = getStatusColor(s);
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusPill,
                      isCurrent && { backgroundColor: color, borderColor: color },
                      !isCurrent && { borderColor: color + '66' },
                    ]}
                    onPress={() => handleStatusChange(s)}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isCurrent && { color: '#FFFFFF', fontWeight: '700' },
                        !isCurrent && { color: color },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* Cancelled as separate */}
              <TouchableOpacity
                style={[
                  styles.statusPill,
                  booking.status === 'cancelled' && {
                    backgroundColor: danger,
                    borderColor: danger,
                  },
                  booking.status !== 'cancelled' && { borderColor: danger + '66' },
                ]}
                onPress={() => handleStatusChange('cancelled')}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    booking.status === 'cancelled' && { color: '#FFFFFF', fontWeight: '700' },
                    booking.status !== 'cancelled' && { color: danger },
                  ]}
                >
                  Cancelled
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Customer Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer Info</Text>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{booking.customerName || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Phone</Text>
            <TouchableOpacity
              onPress={() => booking.phone && Linking.openURL(`tel:${booking.phone}`)}
              style={styles.phoneRow}
            >
              <Text style={[styles.infoValue, booking.phone && styles.linkText]}>
                {booking.phone || '—'}
              </Text>
              {booking.phone && (
                <Ionicons name="call" size={16} color={primary} style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{booking.email || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="megaphone-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Source</Text>
            <Text style={styles.infoValue}>{booking.source || '—'}</Text>
          </View>
        </View>

        {/* Delivery Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Info</Text>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={[styles.infoValue, { flex: 1 }]}>{booking.address || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{booking.deliveryDate || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Window</Text>
            <Text style={styles.infoValue}>{booking.deliveryWindow || '—'}</Text>
          </View>
          {booking.notes ? (
            <View style={styles.infoRow}>
              <Ionicons name="document-text-outline" size={18} color={textSecondary} />
              <Text style={styles.infoLabel}>Notes</Text>
              <Text style={[styles.infoValue, { flex: 1 }]}>{booking.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Dumpster Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dumpster Info</Text>
          <View style={styles.infoRow}>
            <Ionicons name="cube-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Size</Text>
            <Text style={styles.infoValue}>{booking.dumpsterSize || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="barcode-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Dumpster</Text>
            <Text style={styles.infoValue}>
              {assignedDumpster ? assignedDumpster.id : 'Not assigned'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="car-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Driver</Text>
            <Text style={styles.infoValue}>
              {assignedDriver ? assignedDriver.name : 'Not assigned'}
            </Text>
          </View>
          {booking.serviceType ? (
            <View style={styles.infoRow}>
              <Ionicons name="construct-outline" size={18} color={textSecondary} />
              <Text style={styles.infoLabel}>Service</Text>
              <Text style={styles.infoValue}>{booking.serviceType}</Text>
            </View>
          ) : null}
          {booking.material ? (
            <View style={styles.infoRow}>
              <Ionicons name="layers-outline" size={18} color={textSecondary} />
              <Text style={styles.infoLabel}>Material</Text>
              <Text style={styles.infoValue}>{booking.material}</Text>
            </View>
          ) : null}
        </View>

        {/* Pricing */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base Price</Text>
            <Text style={styles.priceValue}>${(booking.basePrice || 0).toFixed(2)}</Text>
          </View>
          {(booking.discount || 0) > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Discount</Text>
              <Text style={[styles.priceValue, { color: success }]}>
                -${(booking.discount || 0).toFixed(2)}
              </Text>
            </View>
          )}
          {(booking.specialItems || []).length > 0 && (
            <>
              <Text style={styles.specialItemsHeader}>Special Items</Text>
              {booking.specialItems.map((item, idx) => (
                <View key={idx} style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    {item.label} x{item.qty || 1}
                  </Text>
                  <Text style={styles.priceValue}>
                    ${((item.fee || 0) * (item.qty || 1)).toFixed(2)}
                  </Text>
                </View>
              ))}
            </>
          )}
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => router.push(`/booking/edit?id=${id}`)}
          >
            <Ionicons name="create-outline" size={20} color={primary} />
            <Text style={styles.editBtnText}>Edit Booking</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={danger} />
            <Text style={styles.deleteBtnText}>Delete Booking</Text>
          </TouchableOpacity>

          {booking.status !== 'cancelled' && booking.status !== 'completed' && (
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={handleCancel}>
              <Ionicons name="close-circle-outline" size={20} color={textMuted} />
              <Text style={styles.cancelBtnText}>Cancel Booking</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: textColor,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: textMuted,
    fontSize: 16,
    marginTop: 12,
  },
  bookingId: {
    fontSize: 28,
    fontWeight: '800',
    color: primary,
    marginBottom: 8,
  },
  statusSection: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    backgroundColor: bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: textColor,
    marginBottom: 12,
  },
  statusFlow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: textSecondary,
    marginLeft: 8,
    width: 70,
  },
  infoValue: {
    fontSize: 14,
    color: textColor,
    fontWeight: '500',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkText: {
    color: primaryLight,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: textSecondary,
  },
  priceValue: {
    fontSize: 14,
    color: textColor,
    fontWeight: '500',
  },
  specialItemsHeader: {
    fontSize: 13,
    color: textMuted,
    marginTop: 4,
    marginBottom: 8,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: border,
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: textColor,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: primary,
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  editBtn: {
    borderColor: primary,
    backgroundColor: primary + '11',
  },
  editBtnText: {
    color: primary,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteBtn: {
    borderColor: danger,
    backgroundColor: danger + '11',
  },
  deleteBtnText: {
    color: danger,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    borderColor: textMuted,
    backgroundColor: textMuted + '11',
  },
  cancelBtnText: {
    color: textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
});
