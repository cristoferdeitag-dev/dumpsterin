import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';

const COLORS = {
  surface: '#131313',
  surface_container_low: '#1c1b1b',
  surface_container: '#20201f',
  surface_container_high: '#2a2a2a',
  surface_container_highest: '#353535',
  surface_container_lowest: '#0e0e0e',
  surface_bright: '#393939',
  primary: '#ffb77d',
  primary_container: '#ff8c00',
  on_primary: '#4d2600',
  on_surface: '#e5e2e1',
  on_surface_variant: '#ddc1ae',
  tertiary: '#85cfff',
  on_tertiary: '#00344c',
  error: '#ffb4ab',
  outline_variant: '#564334',
  secondary_container: '#474747',
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
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

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

  function handleStatusChange(dumpsterId, newStatus) {
    dispatch({ type: 'UPDATE_DUMPSTER', payload: { id: dumpsterId, status: newStatus } });
  }

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

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <FlatList
        data={filteredDumpsters}
        keyExtractor={(item) => item.id}
        renderItem={renderDumpsterCard}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            {/* Title */}
            <Text style={{ fontSize: 32, fontWeight: '800', color: COLORS.on_surface, letterSpacing: -0.5, marginBottom: 16 }}>
              Inventory Mgmt
            </Text>

            {/* Summary Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {/* Available */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface_container_low, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999 }}>
                <Text style={{ fontSize: 16, color: COLORS.primary }}>{'\u2713'}</Text>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 16 }}>{counts.available}</Text>
                <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>Available</Text>
              </View>
              {/* Delivered */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface_container_low, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999 }}>
                <Text style={{ fontSize: 16, color: COLORS.tertiary }}>{'\u{1F69B}'}</Text>
                <Text style={{ color: COLORS.tertiary, fontWeight: '700', fontSize: 16 }}>{counts.deployed}</Text>
                <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>Delivered</Text>
              </View>
              {/* Maintenance */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface_container_low, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999 }}>
                <Text style={{ fontSize: 16, color: COLORS.error }}>{'\u{1F527}'}</Text>
                <Text style={{ color: COLORS.error, fontWeight: '700', fontSize: 16 }}>{counts.maintenance}</Text>
                <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant }}>Maintenance</Text>
              </View>
            </View>

            {/* Size Breakdown */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              {['10yd', '20yd', '30yd'].map((size) => {
                const s = counts.sizes[size] || { total: 0, available: 0 };
                const label = size.replace('yd', ' Yard');
                return (
                  <View key={size} style={{ flex: 1, backgroundColor: COLORS.surface_container_low, borderRadius: 12, padding: 14, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.on_surface, fontWeight: '800', fontSize: 22, letterSpacing: -0.5 }}>
                      {s.available}/{s.total}
                    </Text>
                    <Text style={{ color: COLORS.on_surface_variant, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>
                      {label}
                    </Text>
                    <View style={{ width: '100%', height: 4, backgroundColor: COLORS.surface_container_lowest, borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                      <View style={{ width: s.total > 0 ? `${(s.available / s.total) * 100}%` : '0%', height: '100%', backgroundColor: s.available > 0 ? COLORS.primary : COLORS.error, borderRadius: 2 }} />
                    </View>
                  </View>
                );
              })}
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
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          bottom: 90,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: COLORS.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
        onPress={() => {}}
      >
        <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.on_primary, marginTop: -2 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
