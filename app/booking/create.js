import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Platform,
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
  status,
} from '../../src/theme/colors';

// White theme overrides for booking form
const bg = '#FFFFFF';
const bgCard = '#F7F7F7';
const bgElevated = '#EEEEEE';
const bgInput = '#FFFFFF';
const border = '#333333';
const textColor = '#333333';
const textSecondary = '#666666';
const textMuted = '#AAAAAA';
const primary = '#ff8c00';
const primaryLight = '#ffb77d';
const primaryDark = '#CC5500';
const success = '#00C853';
const danger = '#FF3D00';
const info = '#2196F3';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAWkJznwQtNDv_MhFhdYvqBdfzAa3IIMew';
const SOURCE_OPTIONS = ['phone', 'website', 'walkin'];

// ── Calendar theme ──
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

// ── Google Places Autocomplete Component (web-only) ──
function AddressAutocomplete({ value, onChangeText, onAddressSelect, placeholder, style }) {
  const [predictions, setPredictions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const autocompleteService = useRef(null);
  const placesService = useRef(null);
  const sessionToken = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (window.google && window.google.maps && window.google.maps.places) {
      initServices();
      return;
    }
    // Check if script is already being loaded
    if (document.querySelector(`script[src*="maps.googleapis.com"]`)) {
      const interval = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          initServices();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => initServices();
    document.head.appendChild(script);
  }, []);

  const initServices = () => {
    try {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      // PlacesService requires a div element
      const div = document.createElement('div');
      placesService.current = new window.google.maps.places.PlacesService(div);
      sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
    } catch (e) {
      // Silently fail if API not available
    }
  };

  const fetchPredictions = useCallback((text) => {
    if (!autocompleteService.current || text.length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      autocompleteService.current.getPlacePredictions(
        {
          input: text,
          componentRestrictions: { country: 'us' },
          bounds: new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(37.2, -122.8),  // SW corner (south of San Jose)
            new window.google.maps.LatLng(38.8, -121.5)   // NE corner (north of Vacaville/Santa Rosa)
          ),
          strictBounds: true,
          types: ['address'],
          sessionToken: sessionToken.current,
        },
        (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
            setPredictions(results.slice(0, 5));
            setShowDropdown(true);
          } else {
            setPredictions([]);
            setShowDropdown(false);
          }
        }
      );
    }, 300);
  }, []);

  const handleSelect = useCallback((prediction) => {
    setShowDropdown(false);
    setPredictions([]);
    onChangeText(prediction.description);

    if (!placesService.current) {
      onAddressSelect({ street: prediction.description, city: '', state: 'CA', zip: '' });
      return;
    }

    placesService.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['address_components', 'formatted_address'],
        sessionToken: sessionToken.current,
      },
      (place, status) => {
        // Refresh token after getDetails
        if (window.google && window.google.maps && window.google.maps.places) {
          sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
        }
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) {
          onAddressSelect({ street: prediction.description, city: '', state: 'CA', zip: '' });
          return;
        }
        const components = place.address_components || [];
        const get = (type) => {
          const c = components.find((c) => c.types.includes(type));
          return c ? c.long_name : '';
        };
        const getShort = (type) => {
          const c = components.find((c) => c.types.includes(type));
          return c ? c.short_name : '';
        };
        const streetNumber = get('street_number');
        const route = get('route');
        const street = [streetNumber, route].filter(Boolean).join(' ');
        onAddressSelect({
          street: street || prediction.structured_formatting?.main_text || '',
          city: get('locality') || get('sublocality_level_1') || get('administrative_area_level_2') || '',
          state: getShort('administrative_area_level_1') || 'CA',
          zip: get('postal_code') || '',
        });
      }
    );
  }, [onChangeText, onAddressSelect]);

  return (
    <View style={s.acWrap}>
      <TextInput
        style={[
          s.input,
          isFocused && s.inputFocused,
          value.length > 0 && s.inputFilled,
          style,
        ]}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          if (Platform.OS === 'web') fetchPredictions(text);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          // Delay hiding so tap can register
          setTimeout(() => setShowDropdown(false), 250);
        }}
        placeholder={placeholder}
        placeholderTextColor={textMuted}
      />
      {showDropdown && predictions.length > 0 && (
        <View style={s.acDropdown}>
          {predictions.map((p) => (
            <TouchableOpacity
              key={p.place_id}
              style={s.acItem}
              onPress={() => handleSelect(p)}
            >
              <Ionicons name="location-outline" size={16} color={primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.acMainText} numberOfLines={1}>
                  {p.structured_formatting?.main_text || p.description}
                </Text>
                <Text style={s.acSecText} numberOfLines={1}>
                  {p.structured_formatting?.secondary_text || ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={s.acPowered}>
            <Text style={s.acPoweredText}>Powered by Google</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Component ──
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
  const [generatedBy, setGeneratedBy] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [sendingQuote, setSendingQuote] = useState(false);

  // Customer autocomplete from Stripe API
  const [stripeCustomers, setStripeCustomers] = useState([]);
  const [searchTimeout, setSearchTimeout] = useState(null);

  const searchStripeCustomers = useCallback((query) => {
    if (!query || query.length < 2) {
      setStripeCustomers([]);
      return;
    }
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://dumpsterin.com/api/customers.php?q=${encodeURIComponent(query)}&limit=8`
        );
        const data = await res.json();
        setStripeCustomers(data.customers || []);
      } catch (e) {
        setStripeCustomers([]);
      }
    }, 300);
    setSearchTimeout(t);
  }, [searchTimeout]);

  const filteredCustomers = stripeCustomers;

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

  // Full address strings
  const fullBillingAddress = useMemo(() => {
    return [billingAddress, billingCity, billingState, billingZip].filter(Boolean).join(', ');
  }, [billingAddress, billingCity, billingState, billingZip]);

  const fullDeliveryAddress = useMemo(() => {
    if (sameAsBilling) {
      return fullBillingAddress;
    }
    return [deliveryAddress, deliveryCity, deliveryState, deliveryZip].filter(Boolean).join(', ');
  }, [sameAsBilling, fullBillingAddress, deliveryAddress, deliveryCity, deliveryState, deliveryZip]);

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

  const validateForm = () => {
    if (!name.trim()) { Alert.alert('Required', 'Customer name is required.'); return false; }
    if (!fullDeliveryAddress.trim()) { Alert.alert('Required', 'Delivery address is required.'); return false; }
    if (!deliveryDate) { Alert.alert('Required', 'Delivery date is required.'); return false; }
    if (!dumpsterSize) { Alert.alert('Required', 'Dumpster size is required.'); return false; }
    if (!serviceType) { Alert.alert('Required', 'Service type is required.'); return false; }
    if (!basePrice || parseFloat(basePrice) <= 0) { Alert.alert('Required', 'Base price must be greater than 0.'); return false; }
    if (!generatedBy) { Alert.alert('Required', 'Please select who generated this quote.'); return false; }
    return true;
  };

  const buildBookingObj = (status) => ({
    customerName: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    billingAddress: fullBillingAddress,
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
    generatedBy,
    paymentMethod: paymentMethod || null,
    status,
    total,
  });

  // BOOK DIRECT — creates booking immediately
  const handleBookDirect = () => {
    if (!validateForm()) return;
    if (!paymentMethod) { Alert.alert('Required', 'Please select payment method for direct booking.'); return; }

    dispatch({ type: 'ADD_BOOKING', payload: buildBookingObj('scheduled') });
    Alert.alert('Booking Created', `Booking created for ${name.trim()}. Payment: ${paymentMethod}.`);
    router.back();
  };

  // SEND QUOTE — creates Stripe invoice + sends email & SMS
  const handleSendQuote = async () => {
    if (!validateForm()) return;
    if (!email.trim() && !phone.trim()) {
      Alert.alert('Required', 'Email or phone is required to send a quote.');
      return;
    }

    setSendingQuote(true);
    try {
      const res = await fetch('https://dumpsterin.com/api/quote.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          billingAddress: fullBillingAddress,
          deliveryAddress: fullDeliveryAddress,
          deliveryDate,
          deliveryWindow: deliveryWindow || 'morning',
          dumpsterSize,
          serviceType,
          basePrice: parseFloat(basePrice) || 0,
          discount: parseFloat(discount) || 0,
          specialItems: Object.values(selectedSpecialItems),
          total,
          generatedBy,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Save as pending booking
        dispatch({ type: 'ADD_BOOKING', payload: buildBookingObj('quote_sent') });
        Alert.alert(
          'Quote Sent!',
          `Invoice sent to ${email.trim() || phone.trim()}.\nStripe Invoice: ${data.invoiceId || 'created'}`,
        );
        router.back();
      } else {
        Alert.alert('Error', data.error || 'Failed to send quote. Try again.');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not connect to server. Check your connection.');
    } finally {
      setSendingQuote(false);
    }
  };

  // ── Render helpers ──

  const renderPill = (label, isSelected, onPress, color) => (
    <TouchableOpacity
      key={label}
      style={[
        s.pill,
        isSelected && {
          backgroundColor: (color || primary) + '18',
          borderColor: color || primary,
          shadowColor: color || primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 4,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          s.pillText,
          isSelected && { color: color || primary, fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = (icon, title) => (
    <View style={s.sectionHeaderRow}>
      <View style={s.sectionIconWrap}>
        <Ionicons name={icon} size={16} color={primary} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionDivider} />
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={textColor} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Booking</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── CUSTOMER INFO ── */}
        <View style={s.card}>
          {renderSectionHeader('person', 'Customer Info')}

          <Text style={s.label}>
            Name <Text style={s.required}>*</Text>
          </Text>
          <View style={s.acWrap}>
            <TextInput
              style={[s.input, name.length > 0 && s.inputFilled]}
              value={name}
              onChangeText={(val) => {
                setName(val);
                setCustomerSearch(val);
                setShowCustomerDropdown(true);
                searchStripeCustomers(val);
              }}
              placeholder="Search existing customers..."
              placeholderTextColor={textMuted}
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <View style={s.acDropdown}>
                {filteredCustomers.map((c) => (
                  <TouchableOpacity
                    key={c.id || c.email}
                    style={s.acItem}
                    onPress={() => selectCustomer(c)}
                  >
                    <Ionicons name="person-circle-outline" size={18} color={primaryLight} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.acMainText}>{c.name}</Text>
                      <Text style={s.acSecText}>{c.email || c.phone}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {filteredCustomers.length === 0 && name.length >= 2 && showCustomerDropdown && (
              <View style={s.acHintRow}>
                <Ionicons name="search-outline" size={13} color={textMuted} />
                <Text style={s.acHintText}>No matching customers in Stripe</Text>
              </View>
            )}
          </View>

          <View style={s.row}>
            <View style={s.col}>
              <Text style={s.label}>Phone</Text>
              <TextInput
                style={[s.input, phone.length > 0 && s.inputFilled]}
                value={phone}
                onChangeText={setPhone}
                placeholder="(510) 555-0000"
                placeholderTextColor={textMuted}
                keyboardType="phone-pad"
              />
            </View>
            <View style={s.col}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={[s.input, email.length > 0 && s.inputFilled]}
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
        <View style={s.card}>
          {renderSectionHeader('card', 'Billing Address')}

          <Text style={s.label}>Street Address</Text>
          <AddressAutocomplete
            value={billingAddress}
            onChangeText={setBillingAddress}
            onAddressSelect={({ street, city, state: st, zip }) => {
              setBillingAddress(street);
              setBillingCity(city);
              setBillingState(st);
              setBillingZip(zip);
            }}
            placeholder="Start typing an address..."
          />

          <View style={s.row3}>
            <View style={s.colFlex2}>
              <Text style={s.label}>City</Text>
              <TextInput
                style={[s.input, billingCity.length > 0 && s.inputFilled]}
                value={billingCity}
                onChangeText={setBillingCity}
                placeholder="Oakland"
                placeholderTextColor={textMuted}
              />
            </View>
            <View style={s.colSmall}>
              <Text style={s.label}>State</Text>
              <TextInput
                style={[s.input, billingState.length > 0 && s.inputFilled]}
                value={billingState}
                onChangeText={setBillingState}
                placeholder="CA"
                placeholderTextColor={textMuted}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
            <View style={s.colSmall}>
              <Text style={s.label}>ZIP</Text>
              <TextInput
                style={[s.input, billingZip.length > 0 && s.inputFilled]}
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
        <View style={s.card}>
          {renderSectionHeader('navigate', 'Delivery Address')}

          <TouchableOpacity
            style={s.checkboxRow}
            onPress={() => setSameAsBilling(!sameAsBilling)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, sameAsBilling && s.checkboxChecked]}>
              {sameAsBilling && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={[s.checkboxLabel, sameAsBilling && { color: primaryLight }]}>
              Same as billing address
            </Text>
          </TouchableOpacity>

          {!sameAsBilling && (
            <>
              <Text style={s.label}>
                Street Address <Text style={s.required}>*</Text>
              </Text>
              <AddressAutocomplete
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                onAddressSelect={({ street, city, state: st, zip }) => {
                  setDeliveryAddress(street);
                  setDeliveryCity(city);
                  setDeliveryState(st);
                  setDeliveryZip(zip);
                }}
                placeholder="Start typing an address..."
              />

              <View style={s.row3}>
                <View style={s.colFlex2}>
                  <Text style={s.label}>City</Text>
                  <TextInput
                    style={[s.input, deliveryCity.length > 0 && s.inputFilled]}
                    value={deliveryCity}
                    onChangeText={setDeliveryCity}
                    placeholder="Berkeley"
                    placeholderTextColor={textMuted}
                  />
                </View>
                <View style={s.colSmall}>
                  <Text style={s.label}>State</Text>
                  <TextInput
                    style={[s.input, deliveryState.length > 0 && s.inputFilled]}
                    value={deliveryState}
                    onChangeText={setDeliveryState}
                    placeholder="CA"
                    placeholderTextColor={textMuted}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={s.colSmall}>
                  <Text style={s.label}>ZIP</Text>
                  <TextInput
                    style={[s.input, deliveryZip.length > 0 && s.inputFilled]}
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
            <View style={s.sameAsPreview}>
              <Ionicons name="checkmark-circle" size={16} color={success} />
              <Text style={s.sameAsText}>{fullBillingAddress}</Text>
            </View>
          ) : null}
        </View>

        {/* ── SCHEDULE ── */}
        <View style={s.card}>
          {renderSectionHeader('calendar', 'Schedule')}

          <Text style={s.label}>
            Delivery Date <Text style={s.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[s.dateBtn, deliveryDate && s.dateBtnFilled]}
            onPress={() => setShowCalendar(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={20} color={deliveryDate ? primary : textMuted} />
            <Text style={[s.dateBtnText, deliveryDate && { color: textColor, fontWeight: '600' }]}>
              {deliveryDate || 'Select a date...'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={textMuted} />
          </TouchableOpacity>

          {/* Calendar Modal */}
          <Modal visible={showCalendar} transparent animationType="fade">
            <TouchableOpacity
              style={s.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowCalendar(false)}
            >
              <View style={s.calendarModal}>
                <View style={s.calendarHeader}>
                  <Text style={s.calendarTitle}>Select Delivery Date</Text>
                  <TouchableOpacity onPress={() => setShowCalendar(false)} style={s.calendarClose}>
                    <Ionicons name="close" size={22} color={textColor} />
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

          <Text style={s.label}>Delivery Window</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={s.pillRow}>
              {DELIVERY_WINDOWS.map((w) =>
                renderPill(w.label, deliveryWindow === w.id, () => setDeliveryWindow(w.id))
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── SERVICE DETAILS ── */}
        <View style={s.card}>
          {renderSectionHeader('cube', 'Service Details')}

          <Text style={s.label}>
            Service Type <Text style={s.required}>*</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={s.pillRow}>
              {SERVICE_TYPES.map((t) =>
                renderPill(
                  `${t.icon} ${t.label}`,
                  serviceType === t.id,
                  () => {
                    setServiceType(t.id);
                    // Reset size if not available in new service
                    if (dumpsterSize && !t.sizes.includes(dumpsterSize)) {
                      setDumpsterSize('');
                      setDumpsterId('');
                      setBasePrice('');
                    }
                  }
                )
              )}
            </View>
          </ScrollView>
          {(() => {
            const selected = SERVICE_TYPES.find((t) => t.id === serviceType);
            if (!selected) return null;
            return (
              <View style={{ marginBottom: 8, paddingHorizontal: 2 }}>
                <Text style={{ color: textSecondary, fontSize: 13, marginBottom: 2 }}>{selected.description}</Text>
                {selected.note ? (
                  <Text style={{ color: info, fontSize: 12, fontStyle: 'italic' }}>{selected.note}</Text>
                ) : null}
              </View>
            );
          })()}

          <Text style={s.label}>
            Dumpster Size <Text style={s.required}>*</Text>
          </Text>
          {serviceType ? (
            <View style={s.pillRow}>
              {DUMPSTER_SIZES.filter((sz) => {
                const selectedSvc = SERVICE_TYPES.find((t) => t.id === serviceType);
                return selectedSvc && selectedSvc.sizes.includes(sz.id);
              }).map((sz) => {
                const count = (state.dumpsters || []).filter(d => d.size === sz.id).length;
                const availCount = (state.dumpsters || []).filter(d => d.size === sz.id && d.status === 'available').length;
                if (count === 0) return null;
                const selectedSvc = SERVICE_TYPES.find((t) => t.id === serviceType);
                const price = (selectedSvc && selectedSvc.priceOverride && selectedSvc.priceOverride[sz.id]) || sz.basePrice;
                return renderPill(
                  `${sz.label} \u2014 $${price} (${availCount} avail)`,
                  dumpsterSize === sz.id,
                  () => {
                    setDumpsterSize(sz.id);
                    setDumpsterId('');
                    setBasePrice(String(price));
                  }
                );
              })}
            </View>
          ) : (
            <Text style={{ color: textMuted, fontSize: 13, marginBottom: 8, fontStyle: 'italic' }}>
              Select a service type first
            </Text>
          )}

          <Text style={s.label}>Type of Material</Text>
          <TextInput
            style={[s.input, material.length > 0 && s.inputFilled]}
            value={material}
            onChangeText={setMaterial}
            placeholder="Specify if different from service type"
            placeholderTextColor={textMuted}
          />
        </View>

        {/* ── PRICING ── */}
        <View style={s.card}>
          {renderSectionHeader('cash', 'Pricing')}

          <View style={s.row}>
            <View style={s.col}>
              <Text style={s.label}>
                Base Price <Text style={s.required}>*</Text>
              </Text>
              <View style={s.priceRow}>
                <Text style={s.dollar}>$</Text>
                <TextInput
                  style={[s.input, s.priceInput, basePrice.length > 0 && s.inputFilled]}
                  value={basePrice}
                  onChangeText={setBasePrice}
                  placeholder="0.00"
                  placeholderTextColor={textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={s.col}>
              <Text style={s.label}>Discount ($)</Text>
              <View style={s.priceRow}>
                <Text style={s.dollar}>$</Text>
                <TextInput
                  style={[s.input, s.priceInput, discount.length > 0 && s.inputFilled]}
                  value={discount}
                  onChangeText={setDiscount}
                  placeholder="0.00"
                  placeholderTextColor={textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          <Text style={s.label}>Special Items</Text>
          <View style={s.specialGrid}>
            {SPECIAL_ITEM_FEES.map((item) => {
              const isSelected = !!selectedSpecialItems[item.id];
              return (
                <View key={item.id} style={s.specialRow}>
                  <TouchableOpacity
                    style={[
                      s.specialPill,
                      isSelected && {
                        backgroundColor: primary + '18',
                        borderColor: primary,
                      },
                    ]}
                    onPress={() => toggleSpecialItem(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.specialCheck, isSelected && s.specialCheckActive]}>
                      {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={[s.specialLabel, isSelected && { color: primary, fontWeight: '600' }]}>
                      {item.label} (${item.fee})
                    </Text>
                  </TouchableOpacity>
                  {isSelected && (
                    <View style={s.qtyRow}>
                      <TouchableOpacity
                        style={s.qtyBtn}
                        onPress={() => updateSpecialItemQty(item.id, (selectedSpecialItems[item.id]?.qty || 1) - 1)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="remove" size={14} color={textSecondary} />
                      </TouchableOpacity>
                      <TextInput
                        style={s.qtyInput}
                        value={String(selectedSpecialItems[item.id]?.qty || 1)}
                        onChangeText={(val) => updateSpecialItemQty(item.id, val)}
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={s.qtyBtn}
                        onPress={() => updateSpecialItemQty(item.id, (selectedSpecialItems[item.id]?.qty || 1) + 1)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={14} color={textSecondary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Total */}
          <View style={s.totalCard}>
            <View>
              <Text style={s.totalLabel}>Estimated Total</Text>
              {parseFloat(discount) > 0 && (
                <Text style={s.totalDiscount}>-${parseFloat(discount).toFixed(2)} discount</Text>
              )}
            </View>
            <Text style={s.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── ASSIGNMENT ── */}
        <View style={s.card}>
          {renderSectionHeader('git-branch', 'Assignment')}

          {dumpsterSize ? (
            <>
              <Text style={s.label}>Assign Dumpster</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={s.pillRow}>
                  {renderPill('Auto (none)', !dumpsterId, () => setDumpsterId(''))}
                  {availableNow.map((d) =>
                    renderPill(d.id, dumpsterId === d.id, () => setDumpsterId(d.id), success)
                  )}
                </View>
              </ScrollView>
              {availableSoon.length > 0 && (
                <View style={s.smartBox}>
                  <View style={s.smartHeader}>
                    <Ionicons name="bulb-outline" size={15} color={primaryLight} />
                    <Text style={s.smartTitle}>Available by delivery date</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={s.pillRow}>
                      {availableSoon.map((d) => (
                        <TouchableOpacity
                          key={d.id}
                          style={[
                            s.pill,
                            { borderStyle: 'dashed' },
                            dumpsterId === d.id && {
                              backgroundColor: primaryLight + '18',
                              borderColor: primaryLight,
                            },
                          ]}
                          onPress={() => setDumpsterId(d.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.pillText, dumpsterId === d.id && { color: primaryLight, fontWeight: '700' }]}>
                            {d.id}
                          </Text>
                          <Text style={s.smartSubtext}>Free by {d._releasesBy}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
              {availableNow.length === 0 && availableSoon.length === 0 && (
                <Text style={s.emptyText}>No dumpsters available for this size and date</Text>
              )}
            </>
          ) : (
            <Text style={s.emptyText}>Select a dumpster size first</Text>
          )}

          <Text style={[s.label, { marginTop: 20 }]}>Assign Driver</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={s.pillRow}>
              {renderPill('None', !driverId, () => setDriverId(''))}
              {(state.drivers || []).map((d) =>
                renderPill(d.name, driverId === d.id, () => setDriverId(d.id), primaryLight)
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── GENERATED BY ── */}
        <View style={s.card}>
          {renderSectionHeader('person-circle', 'Sales Rep')}

          <Text style={s.label}>Generated by <Text style={{ color: danger }}>*</Text></Text>
          <View style={s.pillRow}>
            {renderPill('Tiago', generatedBy === 'tiago', () => setGeneratedBy('tiago'))}
            {renderPill('Asai', generatedBy === 'asai', () => setGeneratedBy('asai'))}
          </View>
        </View>

        {/* ── NOTES & SOURCE ── */}
        <View style={s.card}>
          {renderSectionHeader('document-text', 'Notes & Source')}

          <Text style={s.label}>Notes</Text>
          <TextInput
            style={[s.input, s.multiline, notes.length > 0 && s.inputFilled]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Gate code, special instructions..."
            placeholderTextColor={textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={s.label}>Source</Text>
          <View style={s.pillRow}>
            {SOURCE_OPTIONS.map((opt) =>
              renderPill(
                opt.charAt(0).toUpperCase() + opt.slice(1),
                source === opt,
                () => {
                  setSource(opt);
                  if (opt === 'website' && basePrice) {
                    const disc = (parseFloat(basePrice) * 0.05).toFixed(2);
                    setDiscount(disc);
                  } else if (opt !== 'website' && discount && basePrice) {
                    const webDisc = (parseFloat(basePrice) * 0.05).toFixed(2);
                    if (discount === webDisc) setDiscount('');
                  }
                }
              )
            )}
          </View>
          {source === 'website' && (
            <View style={s.discountBadge}>
              <Ionicons name="pricetag" size={12} color={success} />
              <Text style={s.discountBadgeText}>5% web discount auto-applied</Text>
            </View>
          )}
        </View>

        {/* ── ACTIONS ── */}
        <View style={s.card}>
          {renderSectionHeader('flash', 'Action')}

          {/* Payment Method — for direct booking */}
          <Text style={s.label}>Payment Method</Text>
          <View style={s.pillRow}>
            {renderPill('Cash', paymentMethod === 'cash', () => setPaymentMethod('cash'))}
            {renderPill('Check', paymentMethod === 'check', () => setPaymentMethod('check'))}
            {renderPill('Card', paymentMethod === 'card', () => setPaymentMethod('card'))}
            {renderPill('Zelle', paymentMethod === 'zelle', () => setPaymentMethod('zelle'))}
            {renderPill('Pending', paymentMethod === 'pending', () => setPaymentMethod('pending'))}
          </View>

          {/* Two action buttons */}
          <View style={{ marginTop: 20, gap: 12 }}>
            {/* Send Quote */}
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: '#ff8c00' }]}
              onPress={handleSendQuote}
              activeOpacity={0.85}
              disabled={sendingQuote}
            >
              <Ionicons name="send" size={20} color="#4d2600" />
              <Text style={[s.submitBtnText, { color: '#4d2600' }]}>
                {sendingQuote ? 'Sending...' : 'Send Quote'}
              </Text>
            </TouchableOpacity>
            <Text style={{ textAlign: 'center', fontSize: 11, color: textMuted, marginTop: -6 }}>
              Sends Stripe invoice + SMS to client
            </Text>

            {/* Book Direct */}
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: '#E8E8E8', marginTop: 4 }]}
              onPress={handleBookDirect}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={20} color="#1A1A1A" />
              <Text style={[s.submitBtnText, { color: '#1A1A1A' }]}>Book Direct</Text>
            </TouchableOpacity>
            <Text style={{ textAlign: 'center', fontSize: 11, color: textMuted, marginTop: -6 }}>
              Creates booking immediately (client already paid)
            </Text>
          </View>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──
const s = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 12 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: border,
    backgroundColor: bg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: textColor,
    letterSpacing: -0.3,
  },

  // Cards
  card: {
    backgroundColor: bgCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 0.5,
    borderColor: border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: border + '80',
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: textColor,
    letterSpacing: -0.2,
  },
  sectionDivider: {
    flex: 1,
    height: 0.5,
    backgroundColor: border + '50',
    marginLeft: 8,
  },

  // Labels
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: textSecondary,
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 0.1,
    textTransform: 'uppercase',
  },
  required: { color: danger },

  // Inputs
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: textColor,
    fontWeight: '400',
  },
  inputFocused: {
    borderColor: primary,
    backgroundColor: '#FFFFFF',
  },
  inputFilled: {
    borderColor: '#333333',
    backgroundColor: '#FFFFFF',
  },
  multiline: {
    minHeight: 88,
    paddingTop: 14,
  },

  // Rows
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  row3: { flexDirection: 'row', gap: 10 },
  colFlex2: { flex: 2 },
  colSmall: { flex: 1 },

  // Address Autocomplete
  acWrap: { position: 'relative', zIndex: 10 },
  acDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: bgElevated,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: border,
    marginTop: 6,
    overflow: 'hidden',
    zIndex: 100,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  acItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: border + '60',
  },
  acMainText: {
    fontSize: 14,
    fontWeight: '600',
    color: textColor,
  },
  acSecText: {
    fontSize: 12,
    color: textMuted,
    marginTop: 2,
  },
  acPowered: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'flex-end',
  },
  acPoweredText: {
    fontSize: 10,
    color: textMuted,
  },
  acHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  acHintText: {
    fontSize: 12,
    color: textMuted,
    fontStyle: 'italic',
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: textMuted,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: primary,
    borderColor: primary,
  },
  checkboxLabel: {
    fontSize: 14,
    color: textSecondary,
    fontWeight: '500',
  },

  // Same as preview
  sameAsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: success + '12',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: success + '30',
  },
  sameAsText: {
    fontSize: 13,
    color: textSecondary,
    flex: 1,
    fontWeight: '500',
  },

  // Date picker
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  dateBtnFilled: {
    borderColor: '#333333',
  },
  dateBtnText: {
    flex: 1,
    fontSize: 15,
    color: textMuted,
    fontWeight: '400',
  },

  // Calendar modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calendarModal: {
    backgroundColor: bgCard,
    borderRadius: 20,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 400,
    borderWidth: 0.5,
    borderColor: border,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 0.5,
    borderBottomColor: border,
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: textColor,
  },
  calendarClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pills
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: bgElevated,
  },
  pillText: {
    fontSize: 13,
    color: textSecondary,
    fontWeight: '500',
  },

  // Pricing
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dollar: {
    fontSize: 18,
    color: textSecondary,
    marginRight: 8,
    fontWeight: '700',
  },
  priceInput: { flex: 1 },

  // Special items
  specialGrid: { gap: 10 },
  specialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  specialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: bgElevated,
    gap: 10,
  },
  specialCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: textMuted,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialCheckActive: {
    backgroundColor: primary,
    borderColor: primary,
  },
  specialLabel: {
    fontSize: 13,
    color: textSecondary,
    fontWeight: '500',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: bgElevated,
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    width: 44,
    fontSize: 14,
    color: textColor,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Smart inventory
  emptyText: {
    fontSize: 13,
    color: textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  smartBox: {
    marginTop: 12,
    backgroundColor: primaryLight + '0A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 0.5,
    borderColor: primaryLight + '25',
  },
  smartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  smartTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: primaryLight,
    letterSpacing: 0.2,
  },
  smartSubtext: {
    fontSize: 10,
    color: textMuted,
    marginTop: 3,
  },

  // Total
  totalCard: {
    backgroundColor: bg,
    borderRadius: 14,
    padding: 20,
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: border,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: textSecondary,
    letterSpacing: -0.2,
  },
  totalDiscount: {
    fontSize: 11,
    color: success,
    marginTop: 4,
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '800',
    color: primary,
    letterSpacing: -0.5,
  },

  // Discount badge
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: success + '12',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  discountBadgeText: {
    fontSize: 12,
    color: success,
    fontWeight: '600',
  },

  // Submit
  submitBtn: {
    backgroundColor: primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    shadowColor: primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
