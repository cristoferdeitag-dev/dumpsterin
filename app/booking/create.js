import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
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
  info,
  text as textColor,
  textSecondary,
  textMuted,
} from '../../src/theme/colors';

const SOURCE_OPTIONS = ['phone', 'website', 'walkin'];

// Calendar theme matching the app
const calendarTheme = {
  backgroundColor: bgCard,
  calendarBackground: bgCard,
  textSectionTitleColor: textSecondary,
  selectedDayBackgroundColor: primary,
  selectedDayTextColor: '#FFFFFF',
  todayTextColor: primary,
  dayTextColor: textColor,
  textDisabledColor: textMuted,
  arrowColor: primary,
  monthTextColor: textColor,
  textMonthFontWeight: '700',
  textDayFontSize: 14,
  textMonthFontSize: 16,
  textDayHeaderFontSize: 12,
  'stylesheet.calendar.header': {
    dayTextAtIndex0: { color: danger },
    dayTextAtIndex6: { color: danger },
  },
};

export default function CreateBooking() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  // Customer fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Addresses
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('CA');
  const [billingZip, setBillingZip] = useState('');
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('CA');
  const [deliveryZip, setDeliveryZip] = useState('');

  // Booking details
  const [deliveryDate, setDeliveryDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
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

  // Customer autocomplete from Stripe data (stored in state.customers when available)
  const customers = state.customers || [];
  const filteredCustomers = useMemo(() => {
    if (!customerSearch || customerSearch.length < 2) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    ).slice(0, 8);
  }, [customerSearch, customers]);

  const selectCustomer = useCallback((customer) => {
    setName(customer.name || '');
    setPhone(customer.phone || '');
    setEmail(customer.email || '');
    if (customer.billingAddress) {
      setBillingAddress(customer.billingAddress.line1 || '');
      setBillingCity(customer.billingAddress.city || '');
      setBillingState(customer.billingAddress.state || 'CA');
      setBillingZip(customer.billingAddress.postal_code || '');
    }
    if (customer.deliveryAddress) {
      setDeliveryAddress(customer.deliveryAddress.line1 || '');
      setDeliveryCity(customer.deliveryAddress.city || '');
      setDeliveryState(customer.deliveryAddress.state || 'CA');
      setDeliveryZip(customer.deliveryAddress.postal_code || '');
    }
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  }, []);

  // Full delivery address string
  const fullDeliveryAddress = useMemo(() => {
    if (sameAsBilling) {
      return [billingAddress, billingCity, billingState, billingZip].filter(Boolean).join(', ');
    }
    return [deliveryAddress, deliveryCity, deliveryState, deliveryZip].filter(Boolean).join(', ');
  }, [sameAsBilling, billingAddress, billingCity, billingState, billingZip, deliveryAddress, deliveryCity, deliveryState, deliveryZip]);

  // Smart inventory
  const { availableNow, availableSoon } = useMemo(() => {
    if (!dumpsterSize) return { availableNow: [], availableSoon: [] };
    const sizeMatch = (state.dumpsters || []).filter((d) => d.size === dumpsterSize);
    const now = [];
    const soon = [];
    const rentalDays = dumpsterSize === '10yd' ? 3 : 7;

    sizeMatch.forEach((d) => {
      if (d.status === 'available') {
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
  }, [dumpsterSize, deliveryDate, state.dumpsters, state.bookings]);

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
    if (!fullDeliveryAddress.trim()) return Alert.alert('Required', 'Delivery address is required.');
    if (!deliveryDate) return Alert.alert('Required', 'Delivery date is required.');
    if (!dumpsterSize) return Alert.alert('Required', 'Dumpster size is required.');
    if (!serviceType) return Alert.alert('Required', 'Service type is required.');
    if (!basePrice || parseFloat(basePrice) <= 0)
      return Alert.alert('Required', 'Base price must be greater than 0.');

    const bookingObj = {
      customerName: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      billingAddress: [billingAddress, billingCity, billingState, billingZip].filter(Boolean).join(', '),
      deliveryAddress: fullDeliveryAddress,
      deliveryDate,
      deliveryWindow: deliveryWindow || 'morning',
      dumpsterSize,
      serviceType,
      materialType: material.trim(),
      basePrice: parseFloat(basePrice) || 0,
      discount: parseFloat(discount) || 0,
      specialItems: Object.values(selectedSpecialItems),
      assignedDumpster: dumpsterId || null,
      assignedDriver: driverId || null,
      notes: notes.trim(),
      source: source || 'phone',
      status: 'scheduled',
      total,
    };

    dispatch({ type: 'ADD_BOOKING', payload: bookingObj });
    router.back();
  };

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
        <Text style={styles.headerTitle}>New Booking</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── CUSTOMER INFO ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="person" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Customer Info</Text>
          </View>

          {/* Name with autocomplete */}
          <Text style={styles.label}>
            Name <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.autocompleteWrap}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(val) => {
                setName(val);
                setCustomerSearch(val);
                setShowCustomerDropdown(true);
              }}
              placeholder="Type to search existing customers..."
              placeholderTextColor={textMuted}
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <View style={styles.dropdown}>
                {filteredCustomers.map((c) => (
                  <TouchableOpacity
                    key={c.id || c.email}
                    style={styles.dropdownItem}
                    onPress={() => selectCustomer(c)}
                  >
                    <Text style={styles.dropdownName}>{c.name}</Text>
                    <Text style={styles.dropdownSub}>{c.email || c.phone}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {customers.length === 0 && name.length >= 2 && showCustomerDropdown && (
              <View style={styles.dropdownHint}>
                <Ionicons name="information-circle-outline" size={14} color={textMuted} />
                <Text style={styles.dropdownHintText}>
                  Connect Stripe to autocomplete customers
                </Text>
              </View>
            )}
          </View>

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="(510) 555-0000"
                placeholderTextColor={textMuted}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.col}>
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
            </View>
          </View>
        </View>

        {/* ── BILLING ADDRESS ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="card" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Billing Address</Text>
          </View>

          <Text style={styles.label}>Street Address</Text>
          <TextInput
            style={styles.input}
            value={billingAddress}
            onChangeText={setBillingAddress}
            placeholder="123 Main St"
            placeholderTextColor={textMuted}
          />

          <View style={styles.threeCol}>
            <View style={styles.colFlex2}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={billingCity}
                onChangeText={setBillingCity}
                placeholder="Oakland"
                placeholderTextColor={textMuted}
              />
            </View>
            <View style={styles.colSmall}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={billingState}
                onChangeText={setBillingState}
                placeholder="CA"
                placeholderTextColor={textMuted}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.colSmall}>
              <Text style={styles.label}>ZIP</Text>
              <TextInput
                style={styles.input}
                value={billingZip}
                onChangeText={setBillingZip}
                placeholder="94601"
                placeholderTextColor={textMuted}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
          </View>
        </View>

        {/* ── DELIVERY ADDRESS ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="navigate" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Delivery Address</Text>
          </View>

          {/* Same as billing checkbox */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setSameAsBilling(!sameAsBilling)}
          >
            <Ionicons
              name={sameAsBilling ? 'checkbox' : 'square-outline'}
              size={22}
              color={sameAsBilling ? primary : textMuted}
            />
            <Text style={[styles.checkboxLabel, sameAsBilling && { color: primary }]}>
              Same as billing address
            </Text>
          </TouchableOpacity>

          {!sameAsBilling && (
            <>
              <Text style={styles.label}>Street Address <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                placeholder="456 Oak Ave"
                placeholderTextColor={textMuted}
              />

              <View style={styles.threeCol}>
                <View style={styles.colFlex2}>
                  <Text style={styles.label}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryCity}
                    onChangeText={setDeliveryCity}
                    placeholder="Berkeley"
                    placeholderTextColor={textMuted}
                  />
                </View>
                <View style={styles.colSmall}>
                  <Text style={styles.label}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryState}
                    onChangeText={setDeliveryState}
                    placeholder="CA"
                    placeholderTextColor={textMuted}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.colSmall}>
                  <Text style={styles.label}>ZIP</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryZip}
                    onChangeText={setDeliveryZip}
                    placeholder="94702"
                    placeholderTextColor={textMuted}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>
              </View>
            </>
          )}
          {sameAsBilling && billingAddress ? (
            <View style={styles.sameAsPreview}>
              <Ionicons name="checkmark-circle" size={16} color={success} />
              <Text style={styles.sameAsText}>{[billingAddress, billingCity, billingState, billingZip].filter(Boolean).join(', ')}</Text>
            </View>
          ) : null}
        </View>

        {/* ── DELIVERY DATE & WINDOW ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="calendar" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Schedule</Text>
          </View>

          <Text style={styles.label}>
            Delivery Date <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.datePickerBtn}
            onPress={() => setShowCalendar(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={deliveryDate ? primary : textMuted} />
            <Text style={[styles.datePickerText, deliveryDate && { color: textColor }]}>
              {deliveryDate || 'Select a date...'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={textMuted} />
          </TouchableOpacity>

          {/* Calendar Modal */}
          <Modal visible={showCalendar} transparent animationType="fade">
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowCalendar(false)}
            >
              <View style={styles.calendarModal}>
                <View style={styles.calendarHeader}>
                  <Text style={styles.calendarTitle}>Select Delivery Date</Text>
                  <TouchableOpacity onPress={() => setShowCalendar(false)}>
                    <Ionicons name="close" size={24} color={textColor} />
                  </TouchableOpacity>
                </View>
                <Calendar
                  theme={calendarTheme}
                  onDayPress={(day) => {
                    setDeliveryDate(day.dateString);
                    setShowCalendar(false);
                  }}
                  markedDates={{
                    [deliveryDate]: { selected: true, selectedColor: primary },
                  }}
                  minDate={new Date().toISOString().split('T')[0]}
                  enableSwipeMonths
                />
              </View>
            </TouchableOpacity>
          </Modal>

          <Text style={styles.label}>Delivery Window</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
            <View style={styles.pillRow}>
              {DELIVERY_WINDOWS.map((w) =>
                renderPill(w.label, deliveryWindow === w.id, () => setDeliveryWindow(w.id))
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── SERVICE DETAILS ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="cube" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Service Details</Text>
          </View>

          <Text style={styles.label}>
            Dumpster Size <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.pillRow}>
            {DUMPSTER_SIZES.map((s) => {
              const count = (state.dumpsters || []).filter(d => d.size === s.id).length;
              const availCount = (state.dumpsters || []).filter(d => d.size === s.id && d.status === 'available').length;
              if (count === 0) return null;
              return renderPill(
                `${s.label} — $${s.basePrice} (${availCount} avail)`,
                dumpsterSize === s.id,
                () => {
                  setDumpsterSize(s.id);
                  setDumpsterId('');
                  setBasePrice(String(s.basePrice));
                }
              );
            })}
          </View>

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

          <Text style={styles.label}>Type of Material</Text>
          <TextInput
            style={styles.input}
            value={material}
            onChangeText={setMaterial}
            placeholder="Optional — specify if different from service type"
            placeholderTextColor={textMuted}
          />
        </View>

        {/* ── PRICING ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="cash" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Pricing</Text>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.label}>Base Price <Text style={styles.required}>*</Text></Text>
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
            </View>
            <View style={styles.col}>
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
            </View>
          </View>

          <Text style={styles.label}>Special Items</Text>
          <View style={styles.specialItemsGrid}>
            {SPECIAL_ITEM_FEES.map((item) => {
              const isSelected = !!selectedSpecialItems[item.id];
              return (
                <View key={item.id} style={styles.specialItemRow}>
                  <TouchableOpacity
                    style={[
                      styles.specialItemPill,
                      isSelected && { backgroundColor: primary + '22', borderColor: primary },
                    ]}
                    onPress={() => toggleSpecialItem(item)}
                  >
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={isSelected ? primary : textMuted}
                    />
                    <Text style={[styles.specialItemLabel, isSelected && { color: primary }]}>
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

          {/* Total */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Estimated Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── ASSIGNMENT ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="git-branch" size={18} color={primary} />
            <Text style={styles.sectionTitle}>Assignment</Text>
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
                          <Text style={styles.smartSubtext}>Free by {d._releasesBy}</Text>
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
          ) : (
            <Text style={styles.noneText}>Select a dumpster size first</Text>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>Assign Driver</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
            <View style={styles.pillRow}>
              {renderPill('None', !driverId, () => setDriverId(''))}
              {(state.drivers || []).map((d) =>
                renderPill(d.name, driverId === d.id, () => setDriverId(d.id), primaryLight)
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── NOTES & SOURCE ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Gate code, special instructions..."
            placeholderTextColor={textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Source</Text>
          <View style={styles.pillRow}>
            {SOURCE_OPTIONS.map((s) =>
              renderPill(
                s.charAt(0).toUpperCase() + s.slice(1),
                source === s,
                () => {
                  setSource(s);
                  // Auto-apply 5% web discount
                  if (s === 'website' && basePrice) {
                    const disc = (parseFloat(basePrice) * 0.05).toFixed(2);
                    setDiscount(disc);
                  } else if (s !== 'website' && discount && basePrice) {
                    const webDisc = (parseFloat(basePrice) * 0.05).toFixed(2);
                    if (discount === webDisc) setDiscount('');
                  }
                }
              )
            )}
          </View>
          {source === 'website' && (
            <Text style={{ fontSize: 11, color: success, marginTop: 4 }}>
              5% web discount auto-applied
            </Text>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.submitBtnText}>Create Booking</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: textColor },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Section Cards
  sectionCard: {
    backgroundColor: bgCard, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: border,
  },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: textColor },

  label: { fontSize: 13, fontWeight: '600', color: textSecondary, marginTop: 12, marginBottom: 6 },
  required: { color: danger },
  input: {
    backgroundColor: bgInput, borderRadius: 10, borderWidth: 1, borderColor: border,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: textColor,
  },
  multiline: { minHeight: 80, paddingTop: 12 },

  // Layout
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  threeCol: { flexDirection: 'row', gap: 10 },
  colFlex2: { flex: 2 },
  colSmall: { flex: 1 },

  // Autocomplete
  autocompleteWrap: { position: 'relative', zIndex: 10 },
  dropdown: {
    backgroundColor: bgElevated, borderRadius: 10, borderWidth: 1, borderColor: border,
    marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border },
  dropdownName: { fontSize: 14, fontWeight: '600', color: textColor },
  dropdownSub: { fontSize: 12, color: textMuted, marginTop: 2 },
  dropdownHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 4,
  },
  dropdownHintText: { fontSize: 12, color: textMuted, fontStyle: 'italic' },

  // Checkbox
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkboxLabel: { fontSize: 14, color: textSecondary },

  // Same as preview
  sameAsPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: success + '15', borderRadius: 8, padding: 10, marginTop: 8,
  },
  sameAsText: { fontSize: 13, color: textSecondary, flex: 1 },

  // Date picker
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: bgInput, borderRadius: 10, borderWidth: 1, borderColor: border,
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  datePickerText: { flex: 1, fontSize: 15, color: textMuted },

  // Calendar modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  calendarModal: {
    backgroundColor: bgCard, borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 400,
  },
  calendarHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: border,
  },
  calendarTitle: { fontSize: 16, fontWeight: '700', color: textColor },

  // Pills
  pillScroll: { marginBottom: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: border, backgroundColor: bgElevated,
  },
  pillText: { fontSize: 13, color: textSecondary },

  // Pricing
  priceInputRow: { flexDirection: 'row', alignItems: 'center' },
  dollarSign: { fontSize: 18, color: textSecondary, marginRight: 8, fontWeight: '600' },
  priceInput: { flex: 1 },

  // Special items
  specialItemsGrid: { gap: 8 },
  specialItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  specialItemPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: border, backgroundColor: bgElevated, gap: 8,
  },
  specialItemLabel: { fontSize: 13, color: textSecondary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyLabel: { fontSize: 13, color: textMuted },
  qtyInput: {
    backgroundColor: bgInput, borderRadius: 8, borderWidth: 1, borderColor: border,
    paddingHorizontal: 10, paddingVertical: 6, width: 50, fontSize: 14, color: textColor, textAlign: 'center',
  },

  // Smart inventory
  noneText: { fontSize: 13, color: textMuted, fontStyle: 'italic', marginTop: 8 },
  smartInventory: {
    marginTop: 10, backgroundColor: primaryLight + '0D', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: primaryLight + '30',
  },
  smartHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  smartTitle: { fontSize: 12, fontWeight: '600', color: primaryLight },
  smartPill: { borderStyle: 'dashed' },
  smartSubtext: { fontSize: 10, color: textMuted, marginTop: 2 },

  // Total
  totalCard: {
    backgroundColor: bg, borderRadius: 12, padding: 16, marginTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: textColor },
  totalValue: { fontSize: 24, fontWeight: '800', color: primary },

  // Submit
  submitBtn: {
    backgroundColor: primary, borderRadius: 12, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
