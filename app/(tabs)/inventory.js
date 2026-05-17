import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { useAppActions } from '../../src/context/AppActions';

const COLORS = {
  surface: '#FFFFFF',
  surface_container_low: '#F7F7F7',
  surface_container: '#F2F2F2',
  surface_container_high: '#EEEEEE',
  surface_container_highest: '#E8E8E8',
  surface_container_lowest: '#F0F0F0',
  surface_bright: '#E0E0E0',
  primary: '#FFE066',
  primary_container: '#FFCD11',
  on_primary: '#4d2600',
  on_surface: '#1A1A1A',
  on_surface_variant: '#666666',
  tertiary: '#85cfff',
  on_tertiary: '#00344c',
  error: '#ffb4ab',
  outline_variant: '#E0E0E0',
  secondary_container: '#D0D0D0',
};

const DUMPSTER_IMAGES = {
  '10yd': 'https://tpdumpsters.com/images/dumpsters/10-yard-dumpster.png',
  '20yd': 'https://tpdumpsters.com/images/dumpsters/20-yard-dumpster.png',
  '30yd': 'https://tpdumpsters.com/images/dumpsters/30-yard-dumpster.png',
};

function getCategoryLabel(size) {
  if (size === '10yd') return 'HEAVY DUTY';
  if (size === '20yd') return 'STANDARD ROLL-OFF';
  if (size === '30yd') return 'MAX CAPACITY';
  return 'STANDARD';
}

function getStatusColor(status) {
  if (status === 'deployed') return COLORS.tertiary;
  if (status === 'maintenance') return COLORS.error;
  return COLORS.primary;
}

function getCapacityYards(size) {
  const num = parseInt(size);
  return isNaN(num) ? size : `${num} Yards`;
}

export default function InventoryScreen() {
  const { state } = useApp();
  const { updateDumpsterStatus } = useAppActions();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  // Sections collapsed by default. User taps a size header to expand.
  const [expandedSize, setExpandedSize] = useState(null);

  const counts = useMemo(() => {
    let available = 0, deployed = 0, maintenance = 0;
    state.dumpsters.forEach((d) => {
      if (d.status === 'available') available++;
      else if (d.status === 'deployed') deployed++;
      else if (d.status === 'maintenance') maintenance++;
    });
    // Breakdown by size
    const sizes = {};
    ['10yd', '20yd', '30yd'].forEach((size) => {
      const all = state.dumpsters.filter((d) => d.size === size);
      const avail = all.filter((d) => d.status === 'available');
      sizes[size] = { total: all.length, available: avail.length };
    });
    return { available, deployed, maintenance, sizes };
  }, [state.dumpsters]);

  const filteredDumpsters = useMemo(() => {
    if (!searchQuery.trim()) return state.dumpsters;
    const q = searchQuery.toLowerCase();
    return state.dumpsters.filter(
      (d) => d.id.toLowerCase().includes(q) || d.size.toLowerCase().includes(q) || (d.sizeLabel && d.sizeLabel.toLowerCase().includes(q))
    );
  }, [state.dumpsters, searchQuery]);

  function getLinkedBooking(dumpster) {
    if (dumpster.status !== 'deployed' || !dumpster.assignedBooking) return null;
    return state.bookings.find((b) => b.id === dumpster.assignedBooking) || null;
  }

  async function handleStatusChange(dumpsterId, newStatus) {
    try {
      await updateDumpsterStatus(dumpsterId, newStatus);
    } catch (err) {
      Alert.alert('Could not update', err.message || 'Try again.');
    }
  }

  // Compact row: dumpster id + status badge + linked booking shortcut.
  // No manual status toggle here — status flips automatically when bookings
  // change state (per Asaí: "no deberias poder cambiarlo manualmente").
  function renderDumpsterRow(dumpster) {
    const statusColor = getStatusColor(dumpster.status);
    const linkedBooking = getLinkedBooking(dumpster);
    const statusLabel = dumpster.status === 'deployed' ? 'Delivered' : dumpster.status.charAt(0).toUpperCase() + dumpster.status.slice(1);
    return (
      <TouchableOpacity
        key={dumpster.id}
        onPress={() => linkedBooking && router.push(`/booking/${linkedBooking.id}`)}
        activeOpacity={linkedBooking ? 0.7 : 1}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: COLORS.surface_container_low,
          borderRadius: 10,
          marginBottom: 8,
          gap: 12,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
        <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.on_surface, flex: 1 }} numberOfLines={1}>
          {dumpster.id}
        </Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, backgroundColor: statusColor === COLORS.primary ? 'rgba(255,183,125,0.15)' : statusColor === COLORS.tertiary ? 'rgba(133,207,255,0.15)' : 'rgba(255,180,171,0.15)' }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: statusColor, textTransform: 'uppercase', letterSpacing: 1 }}>
            {statusLabel}
          </Text>
        </View>
        {linkedBooking && (
          <Text style={{ color: COLORS.tertiary, fontSize: 14 }}>›</Text>
        )}
      </TouchableOpacity>
    );
  }

  // KEPT for now in case we need full-card view elsewhere. Not used in main list.
  function renderDumpsterCard({ item: dumpster }) {
    const statusColor = getStatusColor(dumpster.status);
    const linkedBooking = getLinkedBooking(dumpster);
    const isDeployed = dumpster.status === 'deployed';

    return (
      <View
        style={{
          backgroundColor: COLORS.surface_container_low,
          padding: 20,
          borderRadius: 16,
          marginBottom: 16,
          ...(isDeployed ? { borderLeftWidth: 4, borderLeftColor: COLORS.tertiary } : {}),
        }}
      >
        {/* Top row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <View>
            <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 10, color: COLORS.on_surface_variant, marginBottom: 4 }}>
              {getCategoryLabel(dumpster.size)}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: COLORS.on_surface, letterSpacing: -0.5 }}>
              {dumpster.id}
            </Text>
          </View>
          <View style={{
            backgroundColor: statusColor === COLORS.primary ? 'rgba(255,183,125,0.1)' : statusColor === COLORS.tertiary ? 'rgba(133,207,255,0.1)' : 'rgba(255,180,171,0.1)',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 9999,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textTransform: 'uppercase', letterSpacing: 1 }}>
              {dumpster.status}
            </Text>
          </View>
        </View>

        {/* Content */}
        {dumpster.status === 'available' || dumpster.status === 'maintenance' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <View>
              <Text style={{ fontSize: 11, color: COLORS.on_surface_variant, marginBottom: 4 }}>Capacity</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.on_surface }}>
                {getCapacityYards(dumpster.size)}
              </Text>
            </View>
            <Image
              source={{ uri: DUMPSTER_IMAGES[dumpster.size] }}
              style={{ width: 100, height: 70, borderRadius: 8 }}
              resizeMode="contain"
            />
          </View>
        ) : (
          <View style={{ gap: 12, marginBottom: 20 }}>
            {linkedBooking && (
              <>
                <TouchableOpacity
                  onPress={() => router.push(`/booking/${linkedBooking.id}`)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: COLORS.surface_container_lowest,
                    padding: 12,
                    borderRadius: 10,
                  }}
                >
                  <View>
                    <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>
                      Active Booking
                    </Text>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.on_surface, fontFamily: 'monospace' }}>
                      #{linkedBooking.id}
                    </Text>
                  </View>
                  <Text style={{ color: COLORS.tertiary, fontSize: 18 }}>{'\u2197'}</Text>
                </TouchableOpacity>
                <View style={{ paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 11, color: COLORS.on_surface_variant, marginBottom: 2 }}>Location</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.on_surface }} numberOfLines={1}>
                    {linkedBooking.deliveryAddress}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Status Segment Control */}
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: COLORS.surface_container_lowest, borderRadius: 9999 }}>
          {['available', 'deployed', 'maintenance'].map((s) => {
            const isActive = dumpster.status === s;
            const label = s === 'available' ? 'Available' : s === 'deployed' ? 'Delivered' : 'Service';
            let bgColor = 'transparent';
            let textColor = COLORS.on_surface_variant;
            if (isActive) {
              if (s === 'available') { bgColor = COLORS.primary; textColor = COLORS.on_primary; }
              else if (s === 'deployed') { bgColor = COLORS.tertiary; textColor = COLORS.on_tertiary; }
              else { bgColor = COLORS.error; textColor = '#690005'; }
            }
            return (
              <TouchableOpacity
                key={s}
                onPress={() => handleStatusChange(dumpster.id, s)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 9999, backgroundColor: bgColor, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5, color: textColor }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // Group filtered dumpsters by size for the collapsible list below.
  const grouped = useMemo(() => {
    const out = { '10yd': [], '20yd': [], '30yd': [] };
    for (const d of filteredDumpsters) {
      if (out[d.size]) out[d.size].push(d);
    }
    // Sort each group by id so the same dumpster stays in the same spot
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }, [filteredDumpsters]);

  const totalDumpsters = state.dumpsters.length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <FlatList
        data={[]}  // empty — content lives in ListHeaderComponent for the new compact grouped layout
        keyExtractor={(item) => item.id}
        renderItem={() => null}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            {/* Title + total */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 32, fontWeight: '800', color: COLORS.on_surface, letterSpacing: -0.5 }}>
                Inventory
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.on_surface_variant, fontWeight: '600' }}>
                {totalDumpsters} dumpsters
              </Text>
            </View>

            {/* Summary Chips \u2014 equal-flex row so all 3 fit on one line, with
                smaller copy so they don't wrap on narrow phones (Asa\u00ed 2026-04-30). */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {/* Available */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surface_container_low, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 9999 }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 15 }}>{counts.available}</Text>
                <Text style={{ fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>Available</Text>
              </View>
              {/* Delivered */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surface_container_low, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 9999 }}>
                <Text style={{ color: COLORS.tertiary, fontWeight: '700', fontSize: 15 }}>{counts.deployed}</Text>
                <Text style={{ fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>Delivered</Text>
              </View>
              {/* Maintenance */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surface_container_low, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 9999 }}>
                <Text style={{ color: COLORS.error, fontWeight: '700', fontSize: 15 }}>{counts.maintenance}</Text>
                <Text style={{ fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>Maintenance</Text>
              </View>
            </View>

            {/* Search */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: COLORS.surface_container_highest,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                gap: 8,
              }}>
                <Text style={{ color: COLORS.on_surface_variant, fontSize: 16 }}>{'\u{1F50D}'}</Text>
                <TextInput
                  style={{ flex: 1, color: COLORS.on_surface, fontSize: 14 }}
                  placeholder="Search by ID or size..."
                  placeholderTextColor="rgba(221,193,174,0.5)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>

            {/* Collapsible groups by size — tap to expand the dumpster list. */}
            {['10yd', '20yd', '30yd'].map((size) => {
              const list = grouped[size] || [];
              const sizeStats = counts.sizes[size] || { total: 0, available: 0 };
              const delivered = sizeStats.total - sizeStats.available;
              const isExpanded = expandedSize === size;
              const label = size.replace('yd', '-Yard');
              return (
                <View key={size} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => setExpandedSize(isExpanded ? null : size)}
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: COLORS.surface_container_high,
                      borderRadius: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.on_surface, flex: 1 }}>
                      {label} <Text style={{ fontSize: 13, color: COLORS.on_surface_variant, fontWeight: '600' }}>({sizeStats.total})</Text>
                    </Text>
                    {/* Mini status counts */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700' }}>{sizeStats.available} avail</Text>
                      <Text style={{ fontSize: 11, color: COLORS.tertiary, fontWeight: '700' }}>{delivered} deliv</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.on_surface_variant }}>
                      {isExpanded ? '▾' : '▸'}
                    </Text>
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                      {list.length === 0
                        ? <Text style={{ color: COLORS.on_surface_variant, fontSize: 12, paddingVertical: 8 }}>No dumpsters</Text>
                        : list.map(renderDumpsterRow)}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        }
      />

      {/* FAB removed — dumpsters managed from settings */}
    </View>
  );
}
