import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';

const STATUS_COLORS = {
  quote_sent: '#999999',
  scheduled: '#60a5fa',
  in_transit: '#ffb77d',
  on_site: '#00C853',
  ready_for_pickup: '#00b5fc',
  picked_up: '#85cfff',
  dumping: '#FF8C00',
  completed: '#999999',
  cancelled: '#ffb4ab',
};

const TOP_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'active', label: 'Active' },
];

const DETAIL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'on_site', label: 'On Site' },
  { id: 'ready_for_pickup', label: 'Ready' },
  { id: 'picked_up', label: 'Picked Up' },
  { id: 'completed', label: 'Completed' },
];

export default function BookingsScreen() {
  const router = useRouter();
  const { state } = useApp();
  const { bookings } = state;

  const [topFilter, setTopFilter] = useState('all');
  const [detailFilter, setDetailFilter] = useState('all');

  const filteredBookings = useMemo(() => {
    let filtered = [...bookings];

    if (detailFilter !== 'all') {
      filtered = filtered.filter(b => b.status === detailFilter);
    }

    filtered.sort((a, b) => (b.deliveryDate || b.createdAt || '').localeCompare(a.deliveryDate || a.createdAt || ''));

    return filtered;
  }, [bookings, detailFilter]);

  const renderBookingCard = useCallback(({ item: booking }) => {
    const statusColor = STATUS_COLORS[booking.status] || '#999999';
    const sizeNum = booking.dumpsterSize ? booking.dumpsterSize.replace('yd', '') : '--';

    return (
      <TouchableOpacity
        onPress={() => router.push(`/booking/${booking.id}`)}
        activeOpacity={0.7}
        style={{
          backgroundColor: '#F7F7F7',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        {/* Card body */}
        <View style={{ padding: 20 }}>
          {/* Top row: chip + ID */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{
              backgroundColor: `${statusColor}18`,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 9999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusColor }} />
              <Text style={{
                color: statusColor,
                fontSize: 9,
                fontWeight: '800',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}>
                {(booking.status || '').replace('_', ' ')}
              </Text>
            </View>
            <Text style={{
              color: '#666666',
              fontSize: 11,
              fontWeight: '500',
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.3,
            }}>
              #{booking.id}
            </Text>
          </View>

          {/* Customer name */}
          <Text style={{
            color: '#1A1A1A',
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.3,
            marginBottom: 4,
          }}>
            {booking.customerName}
          </Text>

          {/* Address */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 18 }}>
            <Ionicons name="location-outline" size={13} color="#666666" />
            <Text style={{ color: '#666666', fontSize: 13, fontWeight: '400' }} numberOfLines={1}>
              {booking.deliveryAddress}
            </Text>
          </View>

          {/* Bottom row: Size + Price */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{
                color: '#666666',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 2,
              }}>
                Container Size
              </Text>
              <Text style={{ color: '#1A1A1A', fontSize: 24, fontWeight: '800', fontStyle: 'italic' }}>
                {sizeNum}
                <Text style={{ fontSize: 12, fontWeight: '700', fontStyle: 'normal' }}> yd</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{
                color: '#666666',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 2,
              }}>
                Base Rate
              </Text>
              <Text style={{ color: '#ffb77d', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>
                ${booking.basePrice?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer bar */}
        <View style={{
          backgroundColor: '#E8E8E8',
          paddingHorizontal: 20,
          paddingVertical: 14,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="calendar-outline" size={16} color={statusColor} />
            <Text style={{ color: '#1A1A1A', fontSize: 13, fontWeight: '600' }}>
              {booking.deliveryDate || booking.createdAt}
            </Text>
            {booking.pickupDate && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                <Ionicons name="arrow-forward" size={12} color="#ff5252" />
                <Text style={{ color: '#ff5252', fontSize: 11, fontWeight: '700' }}>
                  Pickup {booking.pickupDate}
                </Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#666666" />
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{
          color: '#666666',
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Management Console
        </Text>
        <Text style={{
          color: '#1A1A1A',
          fontSize: 32,
          fontWeight: '800',
          letterSpacing: -0.5,
        }}>
          Bookings
        </Text>
      </View>

      {/* Status Filters */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {DETAIL_FILTERS.map((filter, idx) => (
              <TouchableOpacity
                key={filter.id}
                onPress={() => {
                  setDetailFilter(filter.id);
                  setTopFilter('all');
                }}
                style={{
                  backgroundColor: detailFilter === filter.id ? '#E8E8E8' : '#F7F7F7',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 9999,
                  borderWidth: detailFilter === filter.id ? 1 : 0,
                  borderColor: detailFilter === filter.id ? 'rgba(255, 183, 125, 0.3)' : 'transparent',
                  marginRight: idx < DETAIL_FILTERS.length - 1 ? 8 : 0,
                }}
                activeOpacity={0.7}
              >
                <Text style={{
                  color: detailFilter === filter.id ? '#ffb77d' : '#666666',
                  fontSize: 13,
                  fontWeight: detailFilter === filter.id ? '700' : '500',
                }}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Booking List */}
      <FlatList
        data={filteredBookings}
        renderItem={renderBookingCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="document-text-outline" size={48} color="#D0D0D0" />
            <Text style={{ color: '#666666', fontSize: 14, marginTop: 12, fontWeight: '500' }}>
              No bookings found
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={() => router.push('/booking/create')}
        activeOpacity={0.8}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: '#ff8c00',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#ff8c00',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Ionicons name="add" size={28} color="#4d2600" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
