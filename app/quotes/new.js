// Quote Generator — dedicated screen, ported from Stitch design.
// Provider creates an invoice/quote that goes to ONE of their customers
// (not a marketplace booking). Posts to BD's /api/quotes/create which
// builds the Stripe Invoice inside the provider's Connect account.

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useAuth } from '../../src/context/AuthContext';
import { searchCustomers, createCustomer } from '../../src/lib/customersApi';

const C = {
  primary: '#FFCD11',
  onPrimary: '#1A1A1A',
  accent: '#14213D',
  bg: '#FAFAFA',
  card: '#FFFFFF',
  border: '#E5E5E5',
  text: '#1A1A1A',
  textMuted: '#666666',
  danger: '#C00',
};

const CATALOG_DUMPSTERS = [
  { key: '10yd', label: '10 Yard Dumpster', desc: '1 ton weight limit', price: 599 },
  { key: '20yd', label: '20 Yard Dumpster', desc: '2 tons weight limit', price: 749 },
  { key: '30yd', label: '30 Yard Dumpster', desc: '3 tons weight limit', price: 799 },
];

const CATALOG_ITEMS = [
  { key: 'tire', label: 'Tire', price: 30 },
  { key: 'mattress', label: 'Mattress', price: 40 },
  { key: 'appliance_small', label: 'Appliance (small)', price: 50 },
  { key: 'appliance_large', label: 'Appliance (large)', price: 80 },
  { key: 'electronic_small', label: 'Electronic (small)', price: 25 },
  { key: 'electronic_large', label: 'Electronic (large)', price: 40 },
];

export default function NewQuoteScreen() {
  const router = useRouter();
  const { companyId } = useAuth();

  const [customer, setCustomer] = useState(null);              // selected customer object or null
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');

  const [items, setItems] = useState([]);                       // selected line items
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemTab, setAddItemTab] = useState('dumpsters');    // 'dumpsters' | 'items' | 'custom'
  const [customLabel, setCustomLabel] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSMS, setSendSMS] = useState(false);
  const [daysUntilDue, setDaysUntilDue] = useState(14);
  const [sending, setSending] = useState(false);

  // Search debounce
  useEffect(() => {
    if (!customerSearch || customer) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const rows = await searchCustomers(customerSearch);
      setCustomerResults(rows);
    }, 200);
    return () => clearTimeout(t);
  }, [customerSearch, customer]);

  const subtotal = items.reduce((s, it) => s + it.price * (it.qty || 1), 0);
  const discountNum = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountNum);

  function addItem(item) {
    setItems((prev) => {
      // If already there, bump qty
      const existing = prev.find((p) => p.key === item.key);
      if (existing) {
        return prev.map((p) => (p.key === item.key ? { ...p, qty: (p.qty || 1) + 1 } : p));
      }
      return [...prev, { ...item, qty: 1 }];
    });
    setShowAddItem(false);
  }

  function removeItem(key) {
    setItems((prev) => prev.filter((p) => p.key !== key));
  }

  async function handleCreateCustomer() {
    if (!newCustomerEmail || !newCustomerName) {
      Alert.alert('Required', 'Name and email are required.');
      return;
    }
    try {
      const c = await createCustomer({
        full_name: newCustomerName.trim(),
        email: newCustomerEmail.trim(),
        phone: newCustomerPhone.trim() || null,
        billing_address: newCustomerAddress.trim() ? { street: newCustomerAddress.trim() } : null,
      });
      setCustomer(c);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerEmail('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
    } catch (e) {
      Alert.alert('Could not save customer', String(e.message || e));
    }
  }

  async function handleSend() {
    if (!customer) return Alert.alert('Required', 'Pick or create a customer first.');
    if (items.length === 0) return Alert.alert('Required', 'Add at least one item.');
    if (!companyId) return Alert.alert('Error', 'Could not resolve your company; reload and try again.');

    setSending(true);
    try {
      const payload = {
        provider_id: companyId,
        customer: {
          name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
        },
        items: items.map((it) => ({
          description: `${it.label}${it.qty > 1 ? ` x${it.qty}` : ''}`,
          amount_cents: Math.round(it.price * 100),
          quantity: it.qty || 1,
        })),
        due_days: daysUntilDue,
        notes: notes.trim() || undefined,
      };
      const res = await fetch('https://bookingdumpsters.com/api/quotes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quote API returned an error.');
      Alert.alert(
        'Quote sent ✓',
        `Invoice ${data.invoice_number || data.invoice_id} sent to ${customer.email}.\nAmount: $${(data.amount_due_cents / 100).toFixed(2)}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert('Could not send quote', String(e.message || e));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Quote</Text>
        <TouchableOpacity style={s.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* Customer */}
        <View style={s.card}>
          <Text style={s.cardLabel}>CUSTOMER</Text>
          {customer ? (
            <View style={s.customerSelected}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(customer.full_name || 'C').charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.customerName}>{customer.full_name}</Text>
                <Text style={s.customerMeta}>{customer.email}</Text>
                {customer.phone && <Text style={s.customerMeta}>{customer.phone}</Text>}
              </View>
              <TouchableOpacity onPress={() => setCustomer(null)} style={s.iconBtn}>
                <Ionicons name="pencil" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          ) : showNewCustomerForm ? (
            <View>
              <TextInput style={s.input} value={newCustomerName} onChangeText={setNewCustomerName} placeholder="Full name *" placeholderTextColor={C.textMuted} />
              <TextInput style={s.input} value={newCustomerEmail} onChangeText={setNewCustomerEmail} placeholder="Email *" placeholderTextColor={C.textMuted} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={s.input} value={newCustomerPhone} onChangeText={setNewCustomerPhone} placeholder="Phone" placeholderTextColor={C.textMuted} keyboardType="phone-pad" />
              <TextInput style={s.input} value={newCustomerAddress} onChangeText={setNewCustomerAddress} placeholder="Address (street, city, state, zip)" placeholderTextColor={C.textMuted} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity onPress={() => setShowNewCustomerForm(false)} style={s.btnGhost}>
                  <Text style={s.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateCustomer} style={s.btnPrimarySmall}>
                  <Text style={s.btnPrimaryText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <View style={s.searchWrap}>
                <Ionicons name="search" size={18} color={C.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  placeholder="Search existing customer..."
                  placeholderTextColor={C.textMuted}
                />
              </View>
              {customerResults.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {customerResults.map((c) => (
                    <TouchableOpacity key={c.id} onPress={() => { setCustomer(c); setCustomerSearch(''); }} style={s.searchResult}>
                      <View style={s.avatarSmall}>
                        <Text style={s.avatarTextSmall}>{(c.full_name || '?').charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.searchResultName}>{c.full_name}</Text>
                        <Text style={s.searchResultMeta}>{c.email}{c.bookings_count > 0 ? ` · ${c.bookings_count} bookings` : ''}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity onPress={() => setShowNewCustomerForm(true)} style={s.btnGhost}>
                <Ionicons name="add" size={18} color={C.text} />
                <Text style={s.btnGhostText}>New customer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={s.card}>
          <Text style={s.cardLabel}>ITEMS</Text>
          {items.length === 0 && (
            <Text style={s.empty}>No items yet. Add at least one to send the quote.</Text>
          )}
          {items.map((it) => (
            <View key={it.key} style={s.itemRow}>
              <Text style={s.itemIcon}>{it.icon || '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.itemLabel}>{it.label}{it.qty > 1 ? ` x${it.qty}` : ''}</Text>
                {it.desc && <Text style={s.itemDesc}>{it.desc}</Text>}
              </View>
              <Text style={s.itemPrice}>${(it.price * (it.qty || 1)).toFixed(2)}</Text>
              <TouchableOpacity onPress={() => removeItem(it.key)} style={s.iconBtn}>
                <Ionicons name="close" size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={() => setShowAddItem(true)} style={s.addBtn}>
            <Ionicons name="add-circle-outline" size={20} color={C.text} />
            <Text style={s.addBtnText}>Add item</Text>
          </TouchableOpacity>
        </View>

        {/* Discount + notes */}
        <View style={s.card}>
          <Text style={s.cardLabel}>DISCOUNT & NOTES</Text>
          <TextInput
            style={s.input}
            value={discount}
            onChangeText={setDiscount}
            placeholder="Discount ($) — optional"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[s.input, { height: 80, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes for customer (appears on the invoice)"
            placeholderTextColor={C.textMuted}
            multiline
          />
        </View>

        {/* Totals */}
        <View style={[s.card, { backgroundColor: '#FFFBEA', borderColor: C.primary, borderWidth: 1 }]}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>
          {discountNum > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Discount</Text>
              <Text style={[s.totalValue, { color: C.danger }]}>−${discountNum.toFixed(2)}</Text>
            </View>
          )}
          <View style={[s.totalRow, { marginTop: 4 }]}>
            <Text style={s.totalLabelBig}>Total</Text>
            <Text style={s.totalValueBig}>${total.toFixed(2)}</Text>
          </View>
          <Text style={s.totalHint}>Due in {daysUntilDue} days</Text>
        </View>

        {/* Settings */}
        <View style={s.card}>
          <Text style={s.cardLabel}>SEND OPTIONS</Text>
          <View style={s.settingsRow}>
            <Text style={s.settingsLabel}>Send via email</Text>
            <Switch value={sendEmail} onValueChange={setSendEmail} trackColor={{ true: C.primary }} thumbColor={C.card} />
          </View>
          <View style={s.settingsRow}>
            <Text style={s.settingsLabel}>Send via SMS</Text>
            <Switch value={sendSMS} onValueChange={setSendSMS} trackColor={{ true: C.primary }} thumbColor={C.card} />
          </View>
          <View style={s.settingsRow}>
            <Text style={s.settingsLabel}>Days until due</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[7, 14, 30].map((d) => (
                <TouchableOpacity key={d} onPress={() => setDaysUntilDue(d)} style={[s.daysChip, daysUntilDue === d && s.daysChipActive]}>
                  <Text style={[s.daysChipText, daysUntilDue === d && s.daysChipTextActive]}>{d}d</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky footer. ("Save as Draft" was a dead button — removed until
          drafts actually exist.) */}
      <View style={s.footer}>
        <TouchableOpacity style={[s.btnPrimary, (sending || !customer || items.length === 0) && { opacity: 0.5 }]} onPress={handleSend} disabled={sending || !customer || items.length === 0}>
          {sending ? (
            <ActivityIndicator color={C.onPrimary} />
          ) : (
            <>
              <Text style={s.btnPrimaryText}>Send Quote</Text>
              <Ionicons name="arrow-forward" size={18} color={C.onPrimary} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Add Item modal */}
      <Modal visible={showAddItem} animationType="slide" transparent>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowAddItem(false)} style={s.modalBackdrop}>
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Item</Text>
            <View style={s.tabs}>
              {[
                { id: 'dumpsters', label: 'Dumpsters' },
                { id: 'items', label: 'Special Items' },
                { id: 'custom', label: 'Custom' },
              ].map((t) => (
                <TouchableOpacity key={t.id} onPress={() => setAddItemTab(t.id)} style={[s.tab, addItemTab === t.id && s.tabActive]}>
                  <Text style={[s.tabText, addItemTab === t.id && s.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {addItemTab === 'dumpsters' && CATALOG_DUMPSTERS.map((d) => (
                <TouchableOpacity key={d.key} onPress={() => addItem({ ...d, icon: '📦' })} style={s.catalogRow}>
                  <Text style={s.itemIcon}>📦</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemLabel}>{d.label}</Text>
                    <Text style={s.itemDesc}>{d.desc}</Text>
                  </View>
                  <Text style={s.itemPrice}>${d.price.toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
              {addItemTab === 'items' && CATALOG_ITEMS.map((i) => (
                <TouchableOpacity key={i.key} onPress={() => addItem({ ...i, icon: '🪑' })} style={s.catalogRow}>
                  <Text style={s.itemIcon}>🪑</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemLabel}>{i.label}</Text>
                  </View>
                  <Text style={s.itemPrice}>${i.price.toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
              {addItemTab === 'custom' && (
                <View style={{ paddingVertical: 8 }}>
                  <TextInput style={s.input} value={customLabel} onChangeText={setCustomLabel} placeholder="Item description" placeholderTextColor={C.textMuted} />
                  <TextInput style={s.input} value={customPrice} onChangeText={setCustomPrice} placeholder="Price ($)" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                  <TouchableOpacity
                    style={[s.btnPrimarySmall, { marginTop: 8 }]}
                    onPress={() => {
                      const p = parseFloat(customPrice);
                      if (!customLabel || !p) return Alert.alert('Required', 'Label and price required.');
                      addItem({ key: `custom-${Date.now()}`, label: customLabel, price: p, icon: '🧾' });
                      setCustomLabel('');
                      setCustomPrice('');
                    }}
                  >
                    <Text style={s.btnPrimaryText}>Add custom item</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 1, marginBottom: 10 },
  empty: { color: C.textMuted, fontSize: 13, padding: 8 },
  input: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: C.text,
    marginBottom: 8,
    minHeight: 48,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  searchResultName: { fontSize: 14, fontWeight: '600', color: C.text },
  searchResultMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.primary, fontSize: 16, fontWeight: '700' },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  avatarTextSmall: { color: C.text, fontSize: 13, fontWeight: '700' },
  customerSelected: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerName: { fontSize: 16, fontWeight: '700', color: C.text },
  customerMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  itemIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  itemLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  itemDesc: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: C.text, minWidth: 70, textAlign: 'right' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: C.text },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: C.textMuted },
  totalValue: { fontSize: 14, color: C.text, fontWeight: '600' },
  totalLabelBig: { fontSize: 16, fontWeight: '700', color: C.text },
  totalValueBig: { fontSize: 24, fontWeight: '800', color: C.text },
  totalHint: { fontSize: 11, color: C.textMuted, marginTop: 6 },

  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  settingsLabel: { fontSize: 14, color: C.text },
  daysChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: '#F0F0F0' },
  daysChipActive: { backgroundColor: C.primary },
  daysChipText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  daysChipTextActive: { color: C.onPrimary },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  btnSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '700', color: C.text },
  btnPrimary: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: C.onPrimary },
  btnPrimarySmall: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  btnGhostText: { fontSize: 14, fontWeight: '600', color: C.text },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 14 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12, backgroundColor: '#F0F0F0', borderRadius: 9999, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9999, alignItems: 'center' },
  tabActive: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  tabText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.text },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
});
