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
import { updateBooking as sbUpdateBooking } from '../../src/lib/supabase';
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
  const [resending, setResending] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState('cash');
  const [markPaidNotes, setMarkPaidNotes] = useState('');
  const [invoiceActionBusy, setInvoiceActionBusy] = useState(false);

  // Common helper for the V2 invoice actions (mark paid / void / charge).
  // All three look up the Stripe invoice by booking_id metadata server-side.
  const callInvoiceEndpoint = async (path, body, successMessage) => {
    setInvoiceActionBusy(true);
    try {
      const res = await fetch(`https://tpdumpsters.com/api/invoice/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.bookingNumber || booking.id,
          ...body,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        Alert.alert('Done', successMessage(data));
      } else {
        Alert.alert('Error', data.error || 'Action failed');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    } finally {
      setInvoiceActionBusy(false);
    }
  };

  const handleMarkPaid = () => {
    callInvoiceEndpoint(
      'mark-paid',
      { method: markPaidMethod, notes: markPaidNotes.trim() },
      (d) => `Invoice marked paid (${markPaidMethod}). $${d.amount?.toFixed(2) || '0.00'}`
    );
    setShowMarkPaid(false);
    setMarkPaidNotes('');
  };

  const handleVoidInvoice = () => {
    Alert.alert(
      'Void invoice',
      'This invalidates the Stripe invoice. Customer will not be charged. Use this when a booking was cancelled before payment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void it',
          style: 'destructive',
          onPress: () => callInvoiceEndpoint(
            'void',
            { reason: 'Voided from Dumpsterin app' },
            (d) => `Invoice ${d.action === 'deleted_draft' ? 'deleted (was draft)' : 'voided'}.`
          ),
        },
      ]
    );
  };

  const handleAutoCharge = () => {
    Alert.alert(
      'Auto-charge customer',
      "Charge the saved card on file? Requires customer to have a default payment method in Stripe.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Charge',
          onPress: () => callInvoiceEndpoint(
            'charge',
            {},
            (d) => d.alreadyPaid ? 'Already paid.' : `Charged $${d.amount?.toFixed(2) || '0.00'} successfully.`
          ),
        },
      ]
    );
  };

  // Re-send the existing Stripe invoice email + SMS without creating a new one.
  // Useful when a customer says "no llegó" or you just want a reminder.
  const handleResendInvoice = async () => {
    if (resending) return;
    Alert.alert(
      'Reenviar invoice',
      `¿Reenviar el email + SMS al cliente con la invoice original?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reenviar',
          onPress: async () => {
            setResending(true);
            try {
              const res = await fetch('https://tpdumpsters.com/api/invoice/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bookingId: booking.bookingNumber || booking.id,
                  customerName: booking.customerName,
                  customerEmail: booking.email,
                  customerPhone: booking.phone,
                }),
              });
              const data = await res.json();
              if (res.ok && data.ok) {
                const channels = [data.sentEmail && 'email', data.sentSms && 'SMS'].filter(Boolean).join(' + ');
                Alert.alert('Listo', `Invoice reenviada por ${channels || 'Stripe'}.`);
              } else {
                Alert.alert('Error', data.error || 'No se pudo reenviar la invoice.');
              }
            } catch (err) {
              Alert.alert('Error', 'Sin conexión al servidor. Intenta de nuevo.');
            } finally {
              setResending(false);
            }
          },
        },
      ]
    );
  };

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
          {/* Sales Rep — editable. Persists to bookings.sales_rep so the
              attribution on the Home dashboard reflects reality (Asaí
              2026-04-30: replace the hardcoded map with a real column). */}
          <View style={styles.infoRow}>
            <Ionicons name="person-circle-outline" size={18} color={textSecondary} />
            <Text style={styles.infoLabel}>Sales rep</Text>
            <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
              {['asai', 'tiago', 'website'].map((rep) => {
                const active = (booking.generatedBy || 'asai') === rep;
                const labelMap = { asai: 'Asai', tiago: 'Tiago', website: 'Web' };
                return (
                  <TouchableOpacity
                    key={rep}
                    onPress={async () => {
                      if (active) return;
                      try {
                        await sbUpdateBooking(booking._dbId || booking.id, { sales_rep: rep });
                        dispatch({ type: 'UPDATE_BOOKING', payload: { ...booking, generatedBy: rep } });
                      } catch (e) {
                        Alert.alert('Error', "Couldn't update sales rep.");
                      }
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 9999,
                      backgroundColor: active ? primary : 'transparent',
                      borderWidth: 1,
                      borderColor: active ? primary : '#D8D8D8',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#4d2600' : textSecondary }}>
                      {labelMap[rep]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
          {booking.notesFromCustomer ? (
            <View style={styles.infoRow}>
              <Ionicons name="chatbubble-outline" size={18} color={textSecondary} />
              <Text style={styles.infoLabel}>Customer note</Text>
              <Text style={[styles.infoValue, { flex: 1, fontStyle: 'italic' }]}>
                {booking.notesFromCustomer}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Billing Address (only if customer entered one different from delivery) */}
        {booking.billingAddress &&
        (booking.billingAddress.line1 || booking.billingAddress.city) ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Billing Address</Text>
            <View style={styles.infoRow}>
              <Ionicons name="card-outline" size={18} color={textSecondary} />
              <Text style={styles.infoLabel}>Bill to</Text>
              <Text style={[styles.infoValue, { flex: 1 }]}>
                {[
                  booking.billingAddress.line1,
                  [booking.billingAddress.city, booking.billingAddress.state, booking.billingAddress.zip]
                    .filter(Boolean)
                    .join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {booking.authorizedCharges ? (
              <View style={styles.infoRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#15a37b" />
                <Text style={styles.infoLabel}>Auth.</Text>
                <Text style={[styles.infoValue, { flex: 1, color: '#15a37b' }]}>
                  Customer pre-authorized extra charges
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

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

        {/* Mark as paid modal — pick the payment method that came in outside
            of Stripe (cash, check, Zelle, other) so the invoice on Stripe
            gets correctly marked paid_out_of_band. */}
        <Modal visible={showMarkPaid} transparent animationType="fade" onRequestClose={() => setShowMarkPaid(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMarkPaid(false)}>
            <View style={[styles.extraChargeModal, { padding: 20 }]} onStartShouldSetResponder={() => true}>
              <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Mark invoice as paid</Text>
              <Text style={{ fontSize: 13, color: textSecondary, marginBottom: 14 }}>
                Use this when the customer paid outside of Stripe (cash, check, Zelle).
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Method
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {[
                  { id: 'cash', label: 'Cash' },
                  { id: 'check', label: 'Check' },
                  { id: 'zelle', label: 'Zelle' },
                  { id: 'other', label: 'Other' },
                ].map((m) => {
                  const active = markPaidMethod === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setMarkPaidMethod(m.id)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 9999,
                        borderWidth: 1.5,
                        borderColor: active ? '#00b386' : border,
                        backgroundColor: active ? '#00b38611' : 'transparent',
                      }}
                    >
                      <Text style={{ color: active ? '#00b386' : textColor, fontWeight: '700', fontSize: 13 }}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                Notes (optional)
              </Text>
              <TextInput
                value={markPaidNotes}
                onChangeText={setMarkPaidNotes}
                placeholder="e.g. Check #1234, paid Tuesday"
                placeholderTextColor={textMuted}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: border,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 14,
                  minHeight: 60,
                  marginBottom: 14,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => setShowMarkPaid(false)} style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: border + '88' }}>
                  <Text style={{ fontWeight: '700', color: textColor }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleMarkPaid} disabled={invoiceActionBusy} style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: '#00b386' }}>
                  <Text style={{ fontWeight: '700', color: '#fff' }}>{invoiceActionBusy ? '...' : 'Mark paid'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.duplicateBtn]}
            onPress={() => router.push(`/booking/create?copyFrom=${id}`)}
          >
            <Ionicons name="copy-outline" size={20} color={info} />
            <Text style={styles.duplicateBtnText}>Duplicar invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.resendBtn]}
            onPress={handleResendInvoice}
            disabled={resending}
          >
            <Ionicons name="mail-outline" size={20} color={success} />
            <Text style={styles.resendBtnText}>
              {resending ? 'Resending...' : 'Resend invoice'}
            </Text>
          </TouchableOpacity>

          {/* V2 invoice actions — Asaí 2026-04-30 */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.markPaidBtn]}
            onPress={() => setShowMarkPaid(true)}
            disabled={invoiceActionBusy}
          >
            <Ionicons name="cash-outline" size={20} color="#00b386" />
            <Text style={styles.markPaidBtnText}>Mark as paid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.chargeBtn]}
            onPress={handleAutoCharge}
            disabled={invoiceActionBusy}
          >
            <Ionicons name="flash-outline" size={20} color={primaryDark} />
            <Text style={styles.chargeBtnText}>Auto-charge card</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.voidBtn]}
            onPress={handleVoidInvoice}
            disabled={invoiceActionBusy}
          >
            <Ionicons name="close-circle-outline" size={20} color={danger} />
            <Text style={styles.voidBtnText}>Void invoice</Text>
          </TouchableOpacity>

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
  duplicateBtn: {
    borderColor: info,
    backgroundColor: info + '11',
  },
  duplicateBtnText: {
    color: info,
    fontSize: 16,
    fontWeight: '600',
  },
  resendBtn: {
    borderColor: success,
    backgroundColor: success + '11',
  },
  resendBtnText: {
    color: success,
    fontSize: 16,
    fontWeight: '600',
  },
  markPaidBtn: {
    borderColor: '#00b386',
    backgroundColor: '#00b38611',
  },
  markPaidBtnText: {
    color: '#00b386',
    fontSize: 16,
    fontWeight: '600',
  },
  chargeBtn: {
    borderColor: primaryDark,
    backgroundColor: primaryDark + '11',
  },
  chargeBtnText: {
    color: primaryDark,
    fontSize: 16,
    fontWeight: '600',
  },
  voidBtn: {
    borderColor: danger,
    backgroundColor: danger + '11',
  },
  voidBtnText: {
    color: danger,
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
