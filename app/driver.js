import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Linking,
  Platform,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { useApp } from '../src/context/AppContext';

function getDatePlusDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
import { useRouter } from 'expo-router';
import { DELIVERY_WINDOWS } from '../src/data/mockData';

const C = {
  surface: '#FFFFFF',
  surface_container_low: '#F7F7F7',
  surface_container_high: '#EEEEEE',
  surface_container_highest: '#E8E8E8',
  surface_container_lowest: '#F0F0F0',
  primary: '#ffb77d',
  primary_container: '#ff8c00',
  on_primary: '#4d2600',
  on_surface: '#1A1A1A',
  on_surface_variant: '#666666',
  tertiary: '#85cfff',
  error: '#ffb4ab',
};

const WEIGHT_LIMITS = {
  '10yd': 1,
  '20yd': 2,
  '30yd': 3,
};

const OVERWEIGHT_RATE = 135; // per ton

function getWindowLabel(windowId) {
  const w = DELIVERY_WINDOWS.find(d => d.id === windowId);
  return w ? w.label : windowId || 'TBD';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function DriverScreen() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const deliveries = state.bookings.filter(
    b => b.deliveryDate === today && b.status !== 'completed' && b.status !== 'cancelled'
  );
  const pickups = state.bookings.filter(
    b => b.pickupDate === today && b.status !== 'completed' && b.status !== 'cancelled'
  );

  // Upcoming jobs (next 7 days, excluding today)
  const upcoming = state.bookings.filter(b => {
    if (b.status === 'completed' || b.status === 'cancelled') return false;
    const d = b.deliveryDate || '';
    const p = b.pickupDate || '';
    return (d > today && d <= getDatePlusDays(today, 7)) || (p > today && p <= getDatePlusDays(today, 7));
  }).sort((a, b) => (a.deliveryDate || a.pickupDate || '').localeCompare(b.deliveryDate || b.pickupDate || ''));

  const hasJobs = deliveries.length > 0 || pickups.length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Driver Dashboard</Text>
          <Text style={s.headerDate}>{formatDate(today)}</Text>
          <View style={s.driverChip}>
            <Text style={s.driverChipText}>Driver</Text>
          </View>
        </View>

        {!hasJobs ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🚛</Text>
            <Text style={s.emptyText}>No jobs scheduled for today</Text>
            <Text style={s.emptySubtext}>Enjoy your day off!</Text>
          </View>
        ) : (
          <>
            {/* Deliveries Section */}
            {deliveries.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>DELIVERIES</Text>
                {deliveries.map(booking => (
                  <JobCard
                    key={booking.id}
                    booking={booking}
                    type="delivery"
                    dispatch={dispatch}
                    dumpsters={state.dumpsters}
                  />
                ))}
              </View>
            )}

            {/* Pickups Section */}
            {pickups.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>PICKUPS</Text>
                {pickups.map(booking => (
                  <JobCard
                    key={booking.id}
                    booking={booking}
                    type="pickup"
                    dispatch={dispatch}
                    dumpsters={state.dumpsters}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* Upcoming Jobs */}
        {upcoming.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 12, letterSpacing: -0.3 }}>
              Upcoming (Next 7 Days)
            </Text>
            {upcoming.map(booking => {
              const isDelivery = booking.deliveryDate > today && booking.deliveryDate <= getDatePlusDays(today, 7);
              const isPickup = booking.pickupDate > today && booking.pickupDate <= getDatePlusDays(today, 7);
              const jobDate = isDelivery ? booking.deliveryDate : booking.pickupDate;
              return (
                <View key={booking.id + '-upcoming'} style={{
                  backgroundColor: '#F7F7F7', borderRadius: 12, padding: 16, marginBottom: 10,
                  borderLeftWidth: 4, borderLeftColor: isPickup ? '#ff5252' : '#FF8C00',
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{
                      backgroundColor: isPickup ? 'rgba(255,82,82,0.1)' : 'rgba(255,140,0,0.1)',
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: isPickup ? '#ff5252' : '#FF8C00', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {isPickup ? 'PICKUP' : 'DELIVERY'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#999' }}>{jobDate}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>{booking.customerName}</Text>
                  <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }} numberOfLines={1}>{booking.deliveryAddress}</Text>
                  <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{booking.dumpsterSize} · {booking.deliveryWindow}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function JobCard({ booking, type, dispatch, dumpsters }) {
  const [photoUri, setPhotoUri] = useState(null);
  const [receiptWeight, setReceiptWeight] = useState('');
  const [showOverweight, setShowOverweight] = useState(false);
  const fileInputRef = useRef(null);

  const isDelivery = type === 'delivery';
  const badgeColor = isDelivery ? C.primary_container : '#ff5252';
  const badgeLabel = isDelivery ? 'DELIVERY' : 'PICKUP';

  const dumpster = booking.assignedDumpster
    ? dumpsters.find(d => d.id === booking.assignedDumpster)
    : null;

  const weightLimit = WEIGHT_LIMITS[booking.dumpsterSize] || 2;
  const weightNum = parseFloat(receiptWeight) || 0;
  const extraTons = Math.max(0, weightNum - weightLimit);
  const extraCharge = Math.round(extraTons * OVERWEIGHT_RATE * 100) / 100;

  // Determine which status buttons to show
  const showEnCamino =
    (isDelivery && (booking.status === 'scheduled' || booking.status === 'quote_sent')) ||
    (!isDelivery && (booking.status === 'delivered' || booking.status === 'pickup_ready'));

  const showDelivered = isDelivery && booking.status === 'in_transit';
  const showPickedUp = !isDelivery && booking.status === 'in_transit';

  const showPhotoSection =
    (isDelivery && booking.status === 'delivered') ||
    (!isDelivery && booking.status === 'picked_up');

  const showOverweightCalc = !isDelivery && booking.status === 'picked_up' && photoUri;

  function handleStatusUpdate(status) {
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { bookingId: booking.id, status } });
  }

  function handleNavigate() {
    const encoded = encodeURIComponent(booking.deliveryAddress);
    Linking.openURL('https://maps.google.com/maps?daddr=' + encoded);
  }

  function handleCall() {
    if (booking.phone) {
      Linking.openURL('tel:' + booking.phone);
    }
  }

  function handlePhotoSelected(e) {
    if (Platform.OS === 'web') {
      const file = e?.target?.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setPhotoUri(url);
        if (!isDelivery) setShowOverweight(true);
      }
    }
  }

  function handleChargeOverweight() {
    // In a real app, this would call /api/extra-charge.php
    Alert.alert(
      'Overweight Charge',
      `Charging $${extraCharge.toFixed(2)} for ${extraTons.toFixed(2)} extra tons.`,
      [
        {
          text: 'Confirm',
          onPress: () => handleStatusUpdate('completed'),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function handleCompleteNoOverweight() {
    handleStatusUpdate('completed');
  }

  return (
    <View style={s.card}>
      {/* Type Badge */}
      <View style={[s.badge, { backgroundColor: badgeColor }]}>
        <Text style={s.badgeText}>{badgeLabel}</Text>
      </View>

      {/* Customer Name */}
      <Text style={s.customerName}>{booking.customerName}</Text>

      {/* Address */}
      <View style={s.row}>
        <Text style={s.locationIcon}>📍</Text>
        <Text style={s.addressText}>{booking.deliveryAddress}</Text>
      </View>

      {/* Dumpster Info */}
      <View style={s.row}>
        <Text style={s.infoLabel}>{booking.dumpsterSize?.toUpperCase()}</Text>
        {dumpster && <Text style={s.infoValue}> — {dumpster.id}</Text>}
      </View>

      {/* Time Window */}
      <View style={s.row}>
        <Text style={s.timeIcon}>🕐</Text>
        <Text style={s.timeText}>
          {isDelivery
            ? getWindowLabel(booking.deliveryWindow)
            : getWindowLabel(booking.deliveryWindow)}
        </Text>
      </View>

      {/* Notes */}
      {booking.notes ? (
        <Text style={s.notes}>{booking.notes}</Text>
      ) : null}

      {/* Action Buttons Row */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.navButton} onPress={handleNavigate}>
          <Text style={s.navButtonText}>Navigate</Text>
        </TouchableOpacity>

        {booking.phone ? (
          <TouchableOpacity style={s.callButton} onPress={handleCall}>
            <Text style={s.callButtonText}>Call Customer</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Status Flow Buttons */}
      <View style={s.statusRow}>
        {showEnCamino && (
          <TouchableOpacity
            style={[s.statusButton, { backgroundColor: C.tertiary }]}
            onPress={() => handleStatusUpdate('in_transit')}
          >
            <Text style={[s.statusButtonText, { color: '#1A1A1A' }]}>En Camino</Text>
          </TouchableOpacity>
        )}

        {showDelivered && (
          <TouchableOpacity
            style={[s.statusButton, { backgroundColor: C.primary }]}
            onPress={() => handleStatusUpdate('delivered')}
          >
            <Text style={[s.statusButtonText, { color: C.on_primary }]}>Delivered</Text>
          </TouchableOpacity>
        )}

        {showPickedUp && (
          <TouchableOpacity
            style={[s.statusButton, { backgroundColor: C.primary }]}
            onPress={() => handleStatusUpdate('picked_up')}
          >
            <Text style={[s.statusButtonText, { color: C.on_primary }]}>Picked Up</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Photo Capture Section */}
      {showPhotoSection && !photoUri && (
        <View style={s.photoSection}>
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              style={s.photoButton}
              onPress={() => fileInputRef.current?.click()}
            >
              <Text style={s.photoButtonText}>
                {isDelivery ? '📸 Take Delivery Photo' : '📸 Take Dump Receipt Photo'}
              </Text>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelected}
                style={{ display: 'none' }}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.photoButton}>
              <Text style={s.photoButtonText}>
                {isDelivery ? '📸 Take Delivery Photo' : '📸 Take Dump Receipt Photo'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Photo Thumbnail */}
      {photoUri && (
        <View style={s.thumbnailContainer}>
          <Image source={{ uri: photoUri }} style={s.thumbnail} resizeMode="cover" />
          <Text style={s.thumbnailLabel}>Photo captured</Text>
        </View>
      )}

      {/* Overweight Calculator (pickup only) */}
      {showOverweightCalc && (
        <View style={s.overweightSection}>
          <Text style={s.overweightTitle}>Overweight Check</Text>

          <View style={s.weightRow}>
            <Text style={s.weightLabel}>Weight on receipt (tons)</Text>
            <TextInput
              style={s.weightInput}
              value={receiptWeight}
              onChangeText={setReceiptWeight}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#666"
            />
          </View>

          <View style={s.limitRow}>
            <Text style={s.limitText}>
              Weight limit for {booking.dumpsterSize}: {weightLimit} ton{weightLimit > 1 ? 's' : ''}
            </Text>
          </View>

          {weightNum > 0 && extraTons > 0 && (
            <View style={s.extraRow}>
              <Text style={s.extraText}>
                Over by {extraTons.toFixed(2)} tons — ${extraCharge.toFixed(2)} extra
              </Text>
            </View>
          )}

          <View style={s.overweightActions}>
            {extraTons > 0 && (
              <TouchableOpacity
                style={[s.statusButton, { backgroundColor: C.error }]}
                onPress={handleChargeOverweight}
              >
                <Text style={[s.statusButtonText, { color: '#1a0000' }]}>
                  Charge Overweight (${extraCharge.toFixed(2)})
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.statusButton, { backgroundColor: C.primary }]}
              onPress={handleCompleteNoOverweight}
            >
              <Text style={[s.statusButtonText, { color: C.on_primary }]}>
                {extraTons > 0 ? 'No Overweight — Complete' : 'Complete Job'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* For delivery: after photo, just complete */}
      {isDelivery && photoUri && (
        <TouchableOpacity
          style={[s.statusButton, { backgroundColor: C.primary, marginTop: 12 }]}
          onPress={() => handleStatusUpdate('completed')}
        >
          <Text style={[s.statusButtonText, { color: C.on_primary }]}>Complete Delivery</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    backgroundColor: C.surface_container_low,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.on_surface,
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 18,
    fontWeight: '600',
    color: C.primary,
    marginBottom: 10,
  },
  driverChip: {
    backgroundColor: C.surface_container_highest,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  driverChipText: {
    color: C.on_surface_variant,
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.on_surface_variant,
    letterSpacing: 1.2,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: C.surface_container_low,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.8,
  },
  customerName: {
    fontSize: 20,
    fontWeight: '700',
    color: C.on_surface,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  addressText: {
    fontSize: 14,
    color: C.on_surface_variant,
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
  },
  infoValue: {
    fontSize: 14,
    color: C.on_surface_variant,
  },
  timeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  timeText: {
    fontSize: 14,
    color: C.on_surface_variant,
  },
  notes: {
    fontSize: 13,
    color: C.on_surface_variant,
    fontStyle: 'italic',
    marginTop: 6,
    marginBottom: 4,
    opacity: 0.8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  navButton: {
    flex: 1,
    backgroundColor: C.tertiary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  callButton: {
    flex: 1,
    backgroundColor: C.surface_container_highest,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.on_surface,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  photoSection: {
    marginTop: 12,
  },
  photoButton: {
    backgroundColor: C.surface_container_high,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.on_surface,
  },
  thumbnailContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  thumbnail: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  thumbnailLabel: {
    fontSize: 12,
    color: C.on_surface_variant,
    marginTop: 6,
    opacity: 0.7,
  },
  overweightSection: {
    marginTop: 16,
    backgroundColor: C.surface_container_high,
    borderRadius: 12,
    padding: 16,
  },
  overweightTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.on_surface,
    marginBottom: 12,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weightLabel: {
    fontSize: 14,
    color: C.on_surface_variant,
  },
  weightInput: {
    backgroundColor: C.surface_container_lowest,
    color: C.on_surface,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    width: 100,
    textAlign: 'center',
  },
  limitRow: {
    marginBottom: 8,
  },
  limitText: {
    fontSize: 13,
    color: C.on_surface_variant,
    opacity: 0.8,
  },
  extraRow: {
    backgroundColor: C.surface_container_lowest,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  extraText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.error,
  },
  overweightActions: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: C.on_surface,
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: C.on_surface_variant,
    opacity: 0.7,
  },
});
