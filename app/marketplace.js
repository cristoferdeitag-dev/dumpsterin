import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchMarketplaceOrders,
  acceptOrder,
  rejectOrder,
  uploadBookingPhoto,
  deliveryOnTheWay,
  completeDelivery,
  pickupOnTheWay,
  completePickup,
  submitDisposal,
} from '../src/lib/marketplaceApi';

// Marketplace orders (BookingDumpsters) — Fase A. The provider accepts and
// works marketplace jobs HERE, same app as their own rentals. Every action
// reports back to BD, so the customer's live tracking, photos and automatic
// overweight charges keep working untouched.

const SLOTS = ['8-10am', '10am-12pm', '12-2pm', '2-4pm', '4-6pm'];

function pickFile(accept) {
  // Web-only file picker (the app runs as a PWA). Native builds get this
  // wired to expo-image-picker when the stores release happens.
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

function pickFiles(accept) {
  // Like pickFile but allows selecting multiple (BD requires 2 delivery photos).
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => resolve(input.files ? Array.from(input.files) : []);
    input.click();
  });
}

function minutesLeft(deadline) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.round(ms / 60000);
}

function money(cents) {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function MarketplaceScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null); // booking id being acted on
  const [tons, setTons] = useState({}); // bookingId -> tons text

  const load = useCallback(async () => {
    setLoading(true);
    setOrders(await fetchMarketplaceOrders());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(order, fn, successMsg) {
    setWorking(order.id);
    try {
      await fn();
      if (successMsg) Alert.alert('Done', successMsg);
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Action failed');
    } finally {
      setWorking(null);
    }
  }

  function onAccept(order) {
    if ((order.delivery_window || '').toLowerCase() === 'anytime' && !order.delivery_slot) {
      Alert.alert(
        'Pick a delivery window',
        'The customer chose "anytime" — confirm a 2-hour slot:',
        [
          ...SLOTS.slice(0, 3).map((s) => ({
            text: s,
            onPress: () => run(order, () => acceptOrder(order.booking_number, s), `Accepted with ${s} window.`),
          })),
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } else {
      run(order, () => acceptOrder(order.booking_number), 'Order accepted — it joins your schedule.');
    }
  }

  function onReject(order) {
    Alert.alert(
      `Reject ${order.booking_number}?`,
      'BookingDumpsters will reassign or refund the customer.',
      [
        { text: 'Reject order', style: 'destructive', onPress: () => run(order, () => rejectOrder(order.booking_number, 'rejected_in_app')) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function onDelivered(order) {
    // BD requires 2 delivery photos. Upload them first, then complete via the
    // granular endpoint (which notifies the customer with the photos attached).
    const files = await pickFiles('image/*');
    if (files.length < 2) {
      Alert.alert('2 photos required', 'Select at least 2 photos of the dumpster on site.');
      return;
    }
    run(order, async () => {
      const urls = [];
      for (const f of files.slice(0, 4)) {
        urls.push(await uploadBookingPhoto(order.booking_number, 'delivery', f));
      }
      await completeDelivery(order.booking_number, urls);
    }, 'Marked delivered — customer notified with photos.');
  }

  async function onPickupComplete(order) {
    // 2 pickup photos (empty spot / dumpster loaded), then complete via granular.
    const files = await pickFiles('image/*');
    if (files.length < 2) {
      Alert.alert('2 photos required', 'Select at least 2 pickup photos (the cleared spot and the loaded dumpster).');
      return;
    }
    run(order, async () => {
      const urls = [];
      for (const f of files.slice(0, 4)) {
        urls.push(await uploadBookingPhoto(order.booking_number, 'pickup', f));
      }
      await completePickup(order.booking_number, urls);
    }, 'Picked up — customer notified. Now submit the disposal report.');
  }

  async function onDisposal(order) {
    // Provider only submits EVIDENCE. BookingDumpsters reviews and charges any
    // overweight to the customer — nothing is charged from here.
    const tsFiles = await pickFiles('image/*');
    if (tsFiles.length < 2) {
      Alert.alert('2 transfer-station photos', 'Photo at the station and after dumping.');
      return;
    }
    const ticket = await pickFile('image/*,application/pdf');
    if (!ticket) { Alert.alert('Scale ticket required', 'Choose the scale ticket photo.'); return; }
    const t = parseFloat(tons[order.id]);
    run(order, async () => {
      const tsUrls = [];
      for (const f of tsFiles.slice(0, 3)) {
        tsUrls.push(await uploadBookingPhoto(order.booking_number, 'transfer-station', f));
      }
      const ticketUrl = await uploadBookingPhoto(order.booking_number, 'scale-ticket', ticket);
      await submitDisposal(order.booking_number, {
        transfer_station_photo_urls: tsUrls,
        scale_ticket_photo_url: ticketUrl,
        net_weight_lbs: t && t > 0 ? Math.round(t * 2000) : undefined,
      });
    }, 'Disposal report submitted — BookingDumpsters will review and charge any overweight.');
  }

  const pending = orders.filter((o) => o.provider_confirmation_status === 'pending');
  const active = orders.filter((o) => o.provider_confirmation_status === 'accepted');

  const card = (o, children) => (
    <View key={o.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E8E8', padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <View style={{ backgroundColor: '#14213D', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
          <Text style={{ color: '#FFCD11', fontSize: 11, fontWeight: '800' }}>BD · {o.size}yd</Text>
        </View>
        <Text style={{ fontWeight: '800', fontSize: 13, color: '#1A1A1A', flex: 1 }} numberOfLines={1}>
          {o.customer_name} · {money(o.total_cents)}
        </Text>
        <Text style={{ color: '#888', fontSize: 11, fontWeight: '700' }}>{o.booking_number}</Text>
      </View>
      <Text style={{ color: '#555', fontSize: 12 }} numberOfLines={1}>
        {[o.street, o.city, o.zip].filter(Boolean).join(', ')}
      </Text>
      <Text style={{ color: '#555', fontSize: 12, marginBottom: 8 }}>
        {o.material} · delivery {o.delivery_date}{o.delivery_slot ? ` (${o.delivery_slot})` : o.delivery_window ? ` (${o.delivery_window})` : ''}{o.pickup_date ? ` · pickup ${o.pickup_date}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([o.street, o.city, o.zip].filter(Boolean).join(', '))}`)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2F2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
        >
          <Ionicons name="navigate-outline" size={14} color="#1A1A1A" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>Navigate</Text>
        </TouchableOpacity>
        {children}
      </View>
    </View>
  );

  const actBtn = (label, color, onPress, disabled) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: color, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F7' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#14213D' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#FFCD11" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFFFF' }}>Marketplace</Text>
          <Text style={{ fontSize: 12, color: '#9fb0d0', fontWeight: '600' }}>Orders from bookingdumpsters.com</Text>
        </View>
        <TouchableOpacity onPress={load} style={{ padding: 6 }}>
          <Ionicons name="refresh" size={20} color="#FFCD11" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FFCD11" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {/* Needs answer */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 }}>
            Needs your answer ({pending.length})
          </Text>
          {pending.length === 0 && <Text style={{ color: '#888', marginBottom: 14 }}>Nothing waiting — new orders show up here with a 60-minute timer.</Text>}
          {pending.map((o) => {
            const mins = minutesLeft(o.provider_acceptance_deadline);
            return card(o, (
              <>
                {mins != null && (
                  <View style={{ backgroundColor: mins < 15 ? '#FDECEA' : '#FFF3CD', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7 }}>
                    <Text style={{ color: mins < 15 ? '#C00' : '#8a6d00', fontSize: 12, fontWeight: '800' }}>
                      {mins > 0 ? `${mins} min left` : 'expired'}
                    </Text>
                  </View>
                )}
                {actBtn('Accept', '#00C853', () => onAccept(o), working === o.id)}
                {actBtn('Reject', '#C62828', () => onReject(o), working === o.id)}
              </>
            ));
          })}

          {/* Active lifecycle */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginTop: 12, marginBottom: 8 }}>
            In progress ({active.length})
          </Text>
          {active.length === 0 && <Text style={{ color: '#888' }}>No active marketplace jobs.</Text>}
          {active.map((o) => card(o, (
            <>
              {o.status === 'paid' && actBtn('On the way', '#1D4ED8', () => run(o, () => deliveryOnTheWay(o.booking_number), 'Customer notified you are on the way.'), working === o.id)}
              {o.status === 'dispatched' && actBtn('Delivered + photos', '#00C853', () => onDelivered(o), working === o.id)}
              {o.status === 'delivered' && actBtn('Start pickup', '#B9770E', () => run(o, () => pickupOnTheWay(o.booking_number), 'Customer notified — pickup on the way.'), working === o.id)}
              {o.status === 'picking_up' && actBtn('Picked up + photos', '#00C853', () => onPickupComplete(o), working === o.id)}
              {o.disposal_status === 'in_transit_to_transfer_station' && (
                <>
                  <TextInput
                    value={tons[o.id] || ''}
                    onChangeText={(v) => setTons({ ...tons, [o.id]: v })}
                    placeholder="net tons"
                    keyboardType="decimal-pad"
                    style={{ borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 72, fontSize: 12, backgroundColor: '#FFF' }}
                  />
                  {actBtn('Disposal report', '#6A1B9A', () => onDisposal(o), working === o.id)}
                </>
              )}
            </>
          )))}

          <Text style={{ color: '#999', fontSize: 11, marginTop: 16 }}>
            Every tap reports straight to BookingDumpsters: the customer gets notified (dashboard + email) and photos are stored. You only upload the scale-ticket evidence — BookingDumpsters reviews it and charges any overweight to the customer.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
