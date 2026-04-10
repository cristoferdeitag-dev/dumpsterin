import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import {
  DUMPSTER_SIZES,
  SERVICE_TYPES,
  DELIVERY_WINDOWS,
  SPECIAL_ITEM_FEES,
} from '../../src/data/mockData';
import {
  bg,
  bgCard,
  bgElevated,
  bgInput,
  border,
  primary,
  primaryLight,
  primaryDark,
  success,
  danger,
  text as textColor,
  textSecondary,
  textMuted,
} from '../../src/theme/colors';

const SOURCE_OPTIONS = ['phone', 'website', 'walkin'];

export default function EditBooking() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { state, dispatch } = useApp();

  const booking = state.bookings.find((b) => b.id === id);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryWindow, setDeliveryWindow] = useState('');
  const [dumpsterSize, setDumpsterSize] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [material, setMaterial] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [selectedSpecialItems, setSelectedSpecialItems] = useState({});
  const [dumpsterId, setDumpsterId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');

  // Pre-populate from existing booking
  useEffect(() => {
    if (!booking) return;
    setName(booking.customerName || '');
    setPhone(booking.phone || '');
    setEmail(booking.email || '');
    setAddress(booking.address || '');
    setDeliveryDate(booking.deliveryDate || '');
    // Try to match delivery window back to an id
    const matchedWindow = DELIVERY_WINDOWS.find(
      (w) => w.label === booking.deliveryWindow || w.id === booking.deliveryWindow
    );
    setDeliveryWindow(matchedWindow ? matchedWindow.id : '');
    setDumpsterSize(booking.dumpsterSize || '');
    setServiceType(booking.serviceType || '');
    setMaterial(booking.material || '');
    setBasePrice(booking.basePrice != null ? String(booking.basePrice) : '');
    setDiscount(booking.discount != null ? String(booking.discount) : '');
    setDumpsterId(booking.dumpsterId || '');
    setDriverId(booking.driverId || '');
    setNotes(booking.notes || '');
    setSource(booking.source || '');

    // Reconstruct special items map
    if (booking.specialItems && booking.specialItems.length > 0) {
      const itemsMap = {};
      booking.specialItems.forEach((item) => {
        itemsMap[item.id] = { ...item };
      });
      setSelectedSpecialItems(itemsMap);
    }
  }, [booking]);

  // Smart inventory: include dumpsters freed before delivery date
  const { availableNow, availableSoon } = useMemo(() => {
    if (!dumpsterSize) return { availableNow: [], availableSoon: [] };
    const sizeMatch = (state.dumpsters || []).filter((d) => d.size === dumpsterSize);
    const now = [];
    const soon = [];
    const rentalDays = dumpsterSize === '10yd' ? 3 : 7;

    sizeMatch.forEach((d) => {
      if (d.status === 'available' || d.id === booking?.dumpsterId) {
        now.push(d);
      } else if (d.status === 'deployed' && d.assignedBooking && deliveryDate) {
        const assignedBooking = (state.bookings || []).find((b) => b.id === d.assignedBooking);
        if (assignedBooking && assignedBooking.deliveryDate) {
          const releaseDate = new Date(assignedBooking.deliveryDate + 'T00:00:00');
          releaseDate.setDate(releaseDate.getDate() + rentalDays);
          const targetDate = new Date(deliveryDate + 'T00:00:00');
          if (releaseDate <= targetDate) {
            soon.push({ ...d, _releasesBy: releaseDate.toISOString().slice(0, 10), _fromBooking: assignedBooking.id });
          }
        }
      }
    });
    return { availableNow: now, availableSoon: soon };
  }, [dumpsterSize, deliveryDate, state.dumpsters, state.bookings, booking]);

  const toggleSpecialItem = (item) => {
    setSelectedSpecialItems((prev) => {
      const copy = { ...prev };
      if (copy[item.id]) {
        delete copy[item.id];
      } else {
        copy[item.id] = { ...item, qty: 1 };
      }
      return copy;
    });
  };

  const updateSpecialItemQty = (itemId, qty) => {
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed < 1) return;
    setSelectedSpecialItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], qty: parsed },
    }));
  };

  const total = useMemo(() => {
    const base = parseFloat(basePrice) || 0;
    const disc = parseFloat(discount) || 0;
    const specialTotal = Object.values(selectedSpecialItems).reduce(
      (sum, item) => sum + (item.fee || 0) * (item.qty || 1),
      0
    );
    return base - disc + specialTotal;
  }, [basePrice, discount, selectedSpecialItems]);

  const handleSubmit = () => {
    if (!name.trim()) return Alert.alert('Required', 'Customer name is required.');
    if (!address.trim()) return Alert.alert('Required', 'Delivery address is required.');
    if (!deliveryDate.trim()) return Alert.alert('Required', 'Delivery date is required.');
    if (!dumpsterSize) return Alert.alert('Required', 'Dumpster size is required.');
    if (!serviceType) return Alert.alert('Required', 'Service type is required.');
    if (!material.trim()) return Alert.alert('Required', 'Type of material is required.');
    if (!basePrice || parseFloat(basePrice) <= 0)
      return Alert.alert('Required', 'Base price must be greater than 0.');

    const updatedBooking = {
      ...booking,
      customerName: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      deliveryDate: deliveryDate.trim(),
      deliveryWindow:
        (DELIVERY_WINDOWS.find((w) => w.id === deliveryWindow) || {}).label || deliveryWindow,
      dumpsterSize,
      serviceType,
      material: material.trim(),
      basePrice: parseFloat(basePrice) || 0,
      discount: parseFloat(discount) || 0,
      specialItems: Object.values(selectedSpecialItems),
      dumpsterId: dumpsterId || null,
      driverId: driverId || null,
      notes: notes.trim(),
      source: source || booking?.source || 'phone',
      total,
      updatedAt: new Date().toISOString(),
    };

    dispatch({ type: 'UPDATE_BOOKING', payload: updatedBooking });
    router.back();
  };

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Booking</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={textMuted} />
          <Text style={styles.notFoundText}>Booking not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderPill = (label, isSelected, onPress, color) => (
    <TouchableOpacity
      key={label}
      style={[
        styles.pill,
        isSelected && { backgroundColor: (color || primary) + '22', borderColor: color || primary },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.pillText,
          isSelected && { color: color || primary, fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Booking</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Booking ID (read-only) */}
        <View style={styles.idBadge}>
          <Text style={styles.idText}>#{booking.id}</Text>
        </View>

        {/* Name */}
        <Text style={styles.label}>
          Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Customer name"
          placeholderTextColor={textMuted}
        />

        {/* Phone */}
        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="(555) 123-4567"
          placeholderTextColor={textMuted}
          keyboardType="phone-pad"
        />

        {/* Email */}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Delivery Address */}
        <Text style={styles.label}>
          Delivery Address <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="123 Main St, City, CA"
          placeholderTextColor={textMuted}
        />

        {/* Delivery Date */}
        <Text style={styles.label}>
          Delivery Date <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={deliveryDate}
          onChangeText={setDeliveryDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={textMuted}
        />

        {/* Delivery Window */}
        <Text style={styles.label}>Delivery Window</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          <View style={styles.pillRow}>
            {DELIVERY_WINDOWS.map((w) =>
              renderPill(w.label, deliveryWindow === w.id, () => setDeliveryWindow(w.id))
            )}
          </View>
        </ScrollView>

        {/* Dumpster Size */}
        <Text style={styles.label}>
          Dumpster Size <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.pillRow}>
          {DUMPSTER_SIZES.map((s) =>
            renderPill(
              `${s.label} — $${s.basePrice}`,
              dumpsterSize === s.id,
              () => {
                setDumpsterSize(s.id);
                if (s.id !== dumpsterSize) {
                  setDumpsterId('');
                  setBasePrice(String(s.basePrice));
                }
              }
            )
          )}
        </View>

        {/* Service Type */}
        <Text style={styles.label}>
          Service Type <Text style={styles.required}>*</Text>
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          <View style={styles.pillRow}>
            {SERVICE_TYPES.map((t) =>
              renderPill(t, serviceType === t, () => setServiceType(t))
            )}
          </View>
        </ScrollView>

        {/* Material */}
        <Text style={styles.label}>
          Type of Material <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={material}
          onChangeText={setMaterial}
          placeholder="e.g. Concrete, mixed debris"
          placeholderTextColor={textMuted}
        />

        {/* Base Price */}
        <Text style={styles.label}>
          Base Price <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={[styles.input, styles.priceInput]}
            value={basePrice}
            onChangeText={setBasePrice}
            placeholder="0.00"
            placeholderTextColor={textMuted}
            keyboardType="numeric"
          />
        </View>

        {/* Discount */}
        <Text style={styles.label}>Discount ($)</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={[styles.input, styles.priceInput]}
            value={discount}
            onChangeText={setDiscount}
            placeholder="0.00"
            placeholderTextColor={textMuted}
            keyboardType="numeric"
          />
        </View>

        {/* Special Items */}
        <Text style={styles.label}>Special Items</Text>
        <View style={styles.specialItemsGrid}>
          {SPECIAL_ITEM_FEES.map((item) => {
            const isSelected = !!selectedSpecialItems[item.id];
            return (
              <View key={item.id} style={styles.specialItemRow}>
                <TouchableOpacity
                  style={[
                    styles.specialItemPill,
                    isSelected && {
                      backgroundColor: primary + '22',
                      borderColor: primary,
                    },
                  ]}
                  onPress={() => toggleSpecialItem(item)}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={isSelected ? primary : textMuted}
                  />
                  <Text
                    style={[
                      styles.specialItemLabel,
                      isSelected && { color: primary },
                    ]}
                  >
                    {item.label} (${item.fee})
                  </Text>
                </TouchableOpacity>
                {isSelected && (
                  <View style={styles.qtyRow}>
                    <Text style={styles.qtyLabel}>Qty:</Text>
                    <TextInput
                      style={styles.qtyInput}
                      value={String(selectedSpecialItems[item.id]?.qty || 1)}
                      onChangeText={(val) => updateSpecialItemQty(item.id, val)}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Assign Dumpster — Smart Inventory */}
        {dumpsterSize ? (
          <>
            <Text style={styles.label}>Assign Dumpster</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              <View style={styles.pillRow}>
                {renderPill('Auto (none)', !dumpsterId, () => setDumpsterId(''))}
                {availableNow.map((d) =>
                  renderPill(d.id, dumpsterId === d.id, () => setDumpsterId(d.id), success)
                )}
              </View>
            </ScrollView>
            {availableSoon.length > 0 && (
              <View style={styles.smartInventory}>
                <View style={styles.smartHeader}>
                  <Ionicons name="bulb-outline" size={16} color={primaryLight} />
                  <Text style={styles.smartTitle}>Available by delivery date</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pillRow}>
                    {availableSoon.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={[
                          styles.pill,
                          styles.smartPill,
                          dumpsterId === d.id && { backgroundColor: primaryLight + '22', borderColor: primaryLight },
                        ]}
                        onPress={() => setDumpsterId(d.id)}
                      >
                        <Text style={[styles.pillText, dumpsterId === d.id && { color: primaryLight, fontWeight: '600' }]}>
                          {d.id}
                        </Text>
                        <Text style={styles.smartSubtext}>
                          Free by {d._releasesBy}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
            {availableNow.length === 0 && availableSoon.length === 0 && (
              <Text style={styles.noneText}>No dumpsters available for this size and date</Text>
            )}
          </>
        ) : null}

        {/* Assign Driver */}
        <Text style={styles.label}>Assign Driver</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          <View style={styles.pillRow}>
            {renderPill('None', !driverId, () => setDriverId(''))}
            {(state.drivers || []).map((d) =>
              renderPill(d.name, driverId === d.id, () => setDriverId(d.id), primaryLight)
            )}
          </View>
        </ScrollView>

        {/* Notes */}
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Additional notes..."
          placeholderTextColor={textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Source */}
        <Text style={styles.label}>Source</Text>
        <View style={styles.pillRow}>
          {SOURCE_OPTIONS.map((s) =>
            renderPill(
              s.charAt(0).toUpperCase() + s.slice(1),
              source === s,
              () => setSource(s)
            )
          )}
        </View>

        {/* Total */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Estimated Total</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.submitBtnText}>Save Changes</Text>
        </TouchableOpacity>

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
  idBadge: {
    alignSelf: 'flex-start',
    backgroundColor: primary + '22',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  idText: {
    fontSize: 18,
    fontWeight: '800',
    color: primary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  required: {
    color: danger,
  },
  input: {
    backgroundColor: bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: textColor,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  pillScroll: {
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: border,
    backgroundColor: bgElevated,
  },
  pillText: {
    fontSize: 13,
    color: textSecondary,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dollarSign: {
    fontSize: 18,
    color: textSecondary,
    marginRight: 8,
    fontWeight: '600',
  },
  priceInput: {
    flex: 1,
  },
  specialItemsGrid: {
    gap: 8,
  },
  specialItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  specialItemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: border,
    backgroundColor: bgElevated,
    gap: 8,
  },
  specialItemLabel: {
    fontSize: 13,
    color: textSecondary,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyLabel: {
    fontSize: 13,
    color: textMuted,
  },
  qtyInput: {
    backgroundColor: bgInput,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 50,
    fontSize: 14,
    color: textColor,
    textAlign: 'center',
  },
  noneText: {
    fontSize: 13,
    color: textMuted,
    fontStyle: 'italic',
    alignSelf: 'center',
    marginLeft: 8,
    marginTop: 8,
  },
  smartInventory: {
    marginTop: 10,
    backgroundColor: primaryLight + '0D',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: primaryLight + '30',
  },
  smartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  smartTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: primaryLight,
  },
  smartPill: {
    borderStyle: 'dashed',
  },
  smartSubtext: {
    fontSize: 10,
    color: textMuted,
    marginTop: 2,
  },
  totalCard: {
    backgroundColor: bgCard,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: textColor,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: primary,
  },
  submitBtn: {
    backgroundColor: primary,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
