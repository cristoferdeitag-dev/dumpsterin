import React, { useEffect, useState } from 'react';
import { supabase, getCompanyId } from '../../src/lib/supabase';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { useAuth } from '../../src/context/AuthContext';
import { COMPANY } from '../../src/data/mockData';
import { DEFAULT_PRICING, fetchProviderPricing } from '../../src/data/pricingDefaults';
import {
  bg,
  bgCard,
  border,
  primary,
  onPrimary,
  success,
  warning,
  danger,
  info,
  text,
  textSecondary,
  textMuted,
} from '../../src/theme/colors';

function SectionCard({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <View style={styles.infoRow}>
      {icon && <Ionicons name={icon} size={16} color={textMuted} style={styles.infoIcon} />}
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

// Editable price row used inside the Pricing panel. `helper` is small,
// read-only text shown under the label (weight/days/dims). `value` is the
// numeric price as a string; `onChange` receives the raw text.
function PriceRow({ label, helper, value, onChange }) {
  return (
    <View style={styles.priceRow}>
      <View style={styles.priceInfo}>
        <Text style={styles.priceLabel}>{label}</Text>
        {helper ? <Text style={styles.priceHelper}>{helper}</Text> : null}
      </View>
      <View style={styles.priceInputWrap}>
        <Text style={styles.priceDollar}>$</Text>
        <TextInput
          style={styles.priceInput}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={textMuted}
          selectTextOnFocus
        />
      </View>
    </View>
  );
}

// Editable special-item row: rename the extra, set its price, or remove it.
function EditableItemRow({ label, value, onChangeLabel, onChangePrice, onRemove }) {
  return (
    <View style={styles.priceRow}>
      <TextInput
        style={[styles.priceLabel, styles.itemLabelInput]}
        value={label}
        onChangeText={onChangeLabel}
        placeholder="Extra name"
        placeholderTextColor={textMuted}
      />
      <View style={styles.priceInputWrap}>
        <Text style={styles.priceDollar}>$</Text>
        <TextInput
          style={styles.priceInput}
          value={value}
          onChangeText={onChangePrice}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={textMuted}
          selectTextOnFocus
        />
      </View>
      <TouchableOpacity onPress={onRemove} style={styles.itemRemoveBtn} hitSlop={8}>
        <Ionicons name="close-circle" size={20} color={textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function DriverRow({ driver }) {
  const statusColor = driver.status === 'active' ? success : textMuted;
  const statusLabel = driver.status === 'active' ? 'Active' : 'Inactive';

  return (
    <View style={styles.driverRow}>
      <View style={styles.driverAvatar}>
        <Ionicons name="person" size={18} color={textSecondary} />
      </View>
      <Text style={styles.driverName}>{driver.name}</Text>
      <View style={[styles.driverStatus, { backgroundColor: statusColor + '1A' }]}>
        <View style={[styles.driverDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.driverStatusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { state } = useApp();
  const { user, profile, companyName, signOut } = useAuth();
  const router = useRouter();
  const drivers = state.drivers || [];

  const [trucks, setTrucks] = useState([]);

  // Editable pricing config. Loaded from BD's quote-config API on mount,
  // falling back to DEFAULT_PRICING. Numeric prices are kept as strings while
  // editing so the inputs behave; we parse them back to numbers on save.
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'

  useEffect(() => {
    (async () => {
      const cid = await getCompanyId();
      if (!cid) return;
      const { data } = await supabase
        .from('trucks')
        .select('id, label, is_active')
        .eq('company_id', cid)
        .order('label');
      setTrucks(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const cid = await getCompanyId();
      const config = await fetchProviderPricing(cid);
      setPricing(config);
      setPricingLoading(false);
    })();
  }, []);

  // Update one size's price (string) by key.
  function setSizePrice(key, text) {
    setSaveState('idle');
    setPricing((prev) => ({
      ...prev,
      sizes: prev.sizes.map((s) => (s.key === key ? { ...s, price: text } : s)),
    }));
  }

  // Update one special item's price (string) by key.
  function setItemPrice(key, text) {
    setSaveState('idle');
    setPricing((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, price: text } : i)),
    }));
  }

  // Rename a special item (its customer-facing label) by key.
  function setItemLabel(key, text) {
    setSaveState('idle');
    setPricing((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, label: text } : i)),
    }));
  }

  // Append a new, empty extra the provider can name + price.
  function addExtra() {
    setSaveState('idle');
    const key = `extra_${Date.now()}`;
    setPricing((prev) => ({
      ...prev,
      items: [...(prev.items || []), { key, label: '', price: '' }],
    }));
  }

  // Remove a special item by key.
  function removeItem(key) {
    setSaveState('idle');
    setPricing((prev) => ({
      ...prev,
      items: (prev.items || []).filter((i) => i.key !== key),
    }));
  }

  // Update a flat fee field (extraDay / overweight / cancelFee).
  function setFee(field, text) {
    setSaveState('idle');
    setPricing((prev) => ({ ...prev, [field]: text }));
  }

  async function handleSavePricing() {
    const cid = await getCompanyId();
    if (!cid) {
      Alert.alert('Error', 'Could not resolve your company; reload and try again.');
      return;
    }
    // Normalize: coerce every price/fee from string back to a number.
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const config = {
      ...pricing,
      sizes: pricing.sizes.map((s) => ({ ...s, price: num(s.price) })),
      items: pricing.items.map((i) => ({ ...i, price: num(i.price) })),
      extraDay: num(pricing.extraDay),
      overweight: num(pricing.overweight),
      cancelFee: num(pricing.cancelFee),
    };
    setSaveState('saving');
    try {
      const res = await fetch('https://bookingdumpsters.com/api/provider/quote-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: cid, config }),
      });
      // The table may not exist yet (persisted:false) — that's fine, the
      // request still succeeds. Only a non-OK HTTP status is a real failure.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `API returned ${res.status}`);
      }
      // Reflect the normalized numbers back into state.
      setPricing(config);
      setSaveState('saved');
    } catch (e) {
      setSaveState('idle');
      Alert.alert('Could not save pricing', String(e.message || e));
    }
  }

  const handleLogout = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth');
          },
        },
      ],
    );
  };
  const serviceAreas = COMPANY.serviceArea || [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.title}>Settings</Text>

        {/* Company Info */}
        <SectionCard title="Company Info" icon="business-outline">
          <InfoRow label="Name" value={COMPANY.name} icon="storefront-outline" />
          <InfoRow label="Phone" value={COMPANY.phone} icon="call-outline" />
          <InfoRow label="Email" value={COMPANY.email} icon="mail-outline" />
          <InfoRow label="Address" value={COMPANY.address} icon="location-outline" />
          <InfoRow label="Hours" value={COMPANY.hours} icon="time-outline" />
        </SectionCard>

        {/* Pricing — editable. Single source the Quote Generator reads from. */}
        <SectionCard title="Pricing" icon="pricetag-outline">
          {pricingLoading ? (
            <ActivityIndicator color={primary} style={{ paddingVertical: 16 }} />
          ) : (
            <>
              <Text style={styles.priceGroupTitle}>Dumpster sizes</Text>
              {pricing.sizes.map((sz) => (
                <PriceRow
                  key={sz.key}
                  label={sz.label}
                  helper={`${sz.weight} · ${sz.days} days · ${sz.dims}`}
                  value={String(sz.price)}
                  onChange={(t) => setSizePrice(sz.key, t)}
                />
              ))}

              <Text style={[styles.priceGroupTitle, styles.priceGroupSpaced]}>Special items</Text>
              {pricing.items.map((it) => (
                <EditableItemRow
                  key={it.key}
                  label={it.label}
                  value={String(it.price)}
                  onChangeLabel={(t) => setItemLabel(it.key, t)}
                  onChangePrice={(t) => setItemPrice(it.key, t)}
                  onRemove={() => removeItem(it.key)}
                />
              ))}
              <TouchableOpacity style={styles.addExtraBtn} onPress={addExtra} activeOpacity={0.8}>
                <Ionicons name="add" size={18} color={text} />
                <Text style={styles.addExtraText}>Add extra</Text>
              </TouchableOpacity>

              <Text style={[styles.priceGroupTitle, styles.priceGroupSpaced]}>Fees</Text>
              <PriceRow
                label="Extra day"
                helper="per day"
                value={String(pricing.extraDay)}
                onChange={(t) => setFee('extraDay', t)}
              />
              <PriceRow
                label="Overweight"
                helper="per extra ton"
                value={String(pricing.overweight)}
                onChange={(t) => setFee('overweight', t)}
              />
              <PriceRow
                label="Cancellation"
                helper="no 24h notice"
                value={String(pricing.cancelFee)}
                onChange={(t) => setFee('cancelFee', t)}
              />

              <TouchableOpacity
                style={[styles.saveBtn, saveState === 'saving' && { opacity: 0.6 }]}
                onPress={handleSavePricing}
                disabled={saveState === 'saving'}
              >
                {saveState === 'saving' ? (
                  <ActivityIndicator color={onPrimary} />
                ) : saveState === 'saved' ? (
                  <>
                    <Ionicons name="checkmark" size={18} color={onPrimary} />
                    <Text style={styles.saveBtnText}>Saved</Text>
                  </>
                ) : (
                  <Text style={styles.saveBtnText}>Save pricing</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </SectionCard>

        {/* Service Area */}
        <SectionCard title="Service Area" icon="map-outline">
          <View style={styles.citiesGrid}>
            {serviceAreas.map((city, index) => (
              <View key={index} style={styles.cityChip}>
                <Ionicons name="location" size={12} color={info} />
                <Text style={styles.cityText}>{city}</Text>
              </View>
            ))}
            {serviceAreas.length === 0 && (
              <Text style={styles.emptyText}>No service areas configured</Text>
            )}
          </View>
        </SectionCard>

        {/* Drivers */}
        <SectionCard title="Drivers" icon="people-outline">
          {drivers.length > 0 ? (
            drivers.map((driver, index) => (
              <DriverRow key={driver.id || index} driver={driver} />
            ))
          ) : (
            <Text style={styles.emptyText}>No drivers registered</Text>
          )}
        </SectionCard>

        {/* Trucks — added 2026-04-30 per Asaí's request alongside drivers. */}
        <SectionCard title="Trucks" icon="car-outline">
          {trucks.length > 0 ? (
            trucks.map((truck) => {
              const statusColor = truck.is_active ? success : textMuted;
              const statusLabel = truck.is_active ? 'Active' : 'Inactive';
              return (
                <View key={truck.id} style={styles.driverRow}>
                  <View style={styles.driverAvatar}>
                    <Ionicons name="car" size={18} color={textSecondary} />
                  </View>
                  <Text style={styles.driverName}>{truck.label}</Text>
                  <View style={[styles.driverStatus, { backgroundColor: statusColor + '1A' }]}>
                    <View style={[styles.driverDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.driverStatusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No trucks registered</Text>
          )}
        </SectionCard>

        {/* App Info */}
        <SectionCard title="App Info" icon="information-circle-outline">
          <InfoRow label="Version" value="1.0.0" icon="code-slash-outline" />
          <InfoRow label="Platform" value="Expo / React Native" icon="phone-portrait-outline" />
          <View style={styles.poweredBy}>
            <Ionicons name="rocket-outline" size={16} color={primary} />
            <Text style={styles.poweredByText}>Powered by Dumpsterin</Text>
          </View>
        </SectionCard>

        {/* Account / Sign out */}
        {user && (
          <SectionCard title="Your account" icon="person-circle-outline">
            <InfoRow label="Email" value={user.email} icon="mail-outline" />
            {profile?.full_name && <InfoRow label="Name" value={profile.full_name} icon="person-outline" />}
            {companyName && <InfoRow label="Company" value={companyName} icon="business-outline" />}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={danger} />
              <Text style={styles.logoutText}>Sign out</Text>
            </TouchableOpacity>
          </SectionCard>
        )}

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: text,
    paddingTop: 16,
    paddingBottom: 16,
  },
  section: {
    backgroundColor: bgCard,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: border,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: text,
  },
  sectionBody: {
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  infoIcon: {
    marginTop: 2,
    marginRight: 12,
    width: 20,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: text,
    fontWeight: '500',
  },
  priceGroupTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  priceGroupSpaced: {
    marginTop: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  priceInfo: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 14,
    color: text,
    fontWeight: '500',
  },
  priceHelper: {
    fontSize: 11,
    color: textMuted,
    marginTop: 2,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: border,
    borderRadius: 8,
    paddingHorizontal: 10,
    minWidth: 92,
  },
  priceDollar: {
    fontSize: 14,
    color: textMuted,
    marginRight: 2,
  },
  priceInput: {
    flex: 1,
    fontSize: 15,
    color: text,
    fontWeight: '600',
    paddingVertical: 8,
    textAlign: 'right',
  },
  itemLabelInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: border,
    paddingVertical: 6,
  },
  itemRemoveBtn: {
    paddingLeft: 2,
  },
  addExtraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: border,
  },
  addExtraText: {
    fontSize: 14,
    fontWeight: '600',
    color: text,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: primary,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 20,
  },
  saveBtnText: {
    color: onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  citiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: info + '15',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  cityText: {
    fontSize: 13,
    color: textSecondary,
    fontWeight: '500',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    flex: 1,
    fontSize: 15,
    color: text,
    fontWeight: '500',
  },
  driverStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  driverDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  driverStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  poweredBy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: border,
    gap: 8,
  },
  poweredByText: {
    fontSize: 14,
    color: primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  footer: {
    height: 20,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: danger,
    borderRadius: 10,
  },
  logoutText: {
    color: danger,
    fontSize: 15,
    fontWeight: '600',
  },
});
