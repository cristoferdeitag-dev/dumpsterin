import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { bgInput } from '../../src/theme/colors';
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

const STATUS_FLOW = ['scheduled', 'in_transit', 'on_site', 'ready_for_pickup', 'picked_up', 'dumping', 'completed'];

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

  // Extra Charge state
  const [showExtraCharge, setShowExtraCharge] = useState(false);
  const [chargeType, setChargeType] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeQty, setChargeQty] = useState('1');
  const [chargingExtra, setChargingExtra] = useState(false);

  const EXTRA_CHARGE_TYPES = [
    { id: 'overweight', label: 'Overweight', unit: 'ton', rate: 135 },
    { id: 'extra_days', label: 'Extra Days', unit: 'day', rate: 49 },
    { id: 'mattress', label: 'Mattress', unit: 'each', rate: 35 },
    { id: 'tires', label: 'Tires', unit: 'each', rate: 30 },
    { id: 'appliance', label: 'Appliance', unit: 'each', rate: 60 },
    { id: 'custom', label: 'Custom', unit: '', rate: 0 },
  ];

  const handleExtraCharge = async (method) => {
    const type = EXTRA_CHARGE_TYPES.find(t => t.id === chargeType);
    if (!type) return Alert.alert('Error', 'Select charge type');
    const qty = parseFloat(chargeQty) || 1;
    const amount = type.id === 'custom' ? (parseFloat(chargeAmount) || 0) : type.rate * qty;
    if (amount <= 0) return Alert.alert('Error', 'Amount must be greater than 0');

    setChargingExtra(true);
    try {
      const res = await fetch('https://dumpsterin.com/api/extra-charge.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: booking.email,
          customerName: booking.customerName,
          phone: booking.phone,
          bookingId: booking.id,
          chargeType: type.label,
          amount,
          qty,
          description: `${type.label}${type.id !== 'custom' ? ` x${qty}` : ''} — Booking ${booking.id}`,
          method, // 'auto' or 'invoice'
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowExtraCharge(false);
        setChargeType('');
        setChargeAmount('');
        setChargeQty('1');
        Alert.alert(
          'Charge ' + (method === 'auto' ? 'Processed' : 'Sent'),
          method === 'auto'
            ? `$${amount.toFixed(2)} charged to card on file.`
            : `Invoice for $${amount.toFixed(2)} sent to ${booking.email || booking.phone}.`
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to process charge');
      }
    } catch (err) {
      Alert.alert('Error', 'Connection failed');
    } finally {
      setChargingExtra(false);
    }
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

        {/* Extra Charge Button */}
        {booking.status !== 'cancelled' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#ff8c00', marginHorizontal: 16, marginBottom: 12 }]}
            onPress={() => setShowExtraCharge(true)}
          >
            <Ionicons name="cash-outline" size={20} color="#4d2600" />
            <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 15, marginLeft: 8 }}>Add Extra Charge</Text>
          </TouchableOpacity>
        )}

        {/* Extra Charge Modal */}
        <Modal visible={showExtraCharge} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowExtraCharge(false)}>
            <View style={styles.extraChargeModal} onStartShouldSetResponder={() => true}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: textColor, marginBottom: 16 }}>Extra Charge</Text>
              <Text style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>For: {booking.customerName}</Text>

              {/* Charge Type Pills */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {EXTRA_CHARGE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => { setChargeType(t.id); if (t.rate) setChargeAmount(String(t.rate)); }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999,
                      backgroundColor: chargeType === t.id ? 'rgba(255,140,0,0.2)' : bgElevated,
                      borderWidth: chargeType === t.id ? 1 : 0,
                      borderColor: '#ff8c00',
                    }}
                  >
                    <Text style={{ color: chargeType === t.id ? '#ffb77d' : textSecondary, fontSize: 13, fontWeight: '600' }}>
                      {t.label}{t.rate ? ` ($${t.rate})` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Quantity */}
              {chargeType && chargeType !== 'custom' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: textSecondary, fontWeight: '600', marginBottom: 6 }}>QUANTITY</Text>
                  <TextInput
                    style={{ backgroundColor: bgInput, borderRadius: 10, padding: 12, color: textColor, fontSize: 16 }}
                    value={chargeQty}
                    onChangeText={setChargeQty}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor={textMuted}
                  />
                </View>
              )}

              {/* Custom Amount */}
              {chargeType === 'custom' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: textSecondary, fontWeight: '600', marginBottom: 6 }}>AMOUNT ($)</Text>
                  <TextInput
                    style={{ backgroundColor: bgInput, borderRadius: 10, padding: 12, color: textColor, fontSize: 16 }}
                    value={chargeAmount}
                    onChangeText={setChargeAmount}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={textMuted}
                  />
                </View>
              )}

              {/* Total Preview */}
              {chargeType && (
                <View style={{ backgroundColor: bgElevated, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>CHARGE AMOUNT</Text>
                  <Text style={{ color: '#ffb77d', fontSize: 28, fontWeight: '800', marginTop: 4 }}>
                    ${chargeType === 'custom'
                      ? (parseFloat(chargeAmount) || 0).toFixed(2)
                      : ((EXTRA_CHARGE_TYPES.find(t => t.id === chargeType)?.rate || 0) * (parseFloat(chargeQty) || 1)).toFixed(2)
                    }
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={{ backgroundColor: '#ff8c00', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={() => handleExtraCharge('auto')}
                  disabled={chargingExtra}
                >
                  <Ionicons name="card" size={18} color="#4d2600" />
                  <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 15 }}>
                    {chargingExtra ? 'Processing...' : 'Charge Card on File'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ backgroundColor: bgElevated, paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={() => handleExtraCharge('invoice')}
                  disabled={chargingExtra}
                >
                  <Ionicons name="send" size={18} color={textSecondary} />
                  <Text style={{ color: textSecondary, fontWeight: '700', fontSize: 15 }}>Send Invoice Instead</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 10, color: textMuted, textAlign: 'center', marginTop: 10 }}>
                {booking.email ? `Card check: ${booking.email}` : 'No email — invoice will use SMS'}
              </Text>
            </View>
          </TouchableOpacity>
        </Modal>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  extraChargeModal: {
    backgroundColor: bgCard,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
});
