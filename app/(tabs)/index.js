import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';

// Bay Area ZIP codes served by TP Dumpsters
const SERVICE_ZIPS = {
  // Oakland
  '94601': 'Oakland', '94602': 'Oakland', '94603': 'Oakland', '94605': 'Oakland', '94606': 'Oakland', '94607': 'Oakland', '94608': 'Oakland', '94609': 'Oakland', '94610': 'Oakland', '94611': 'Oakland', '94612': 'Oakland', '94613': 'Oakland', '94618': 'Oakland', '94619': 'Oakland', '94621': 'Oakland',
  // Berkeley
  '94702': 'Berkeley', '94703': 'Berkeley', '94704': 'Berkeley', '94705': 'Berkeley', '94706': 'Berkeley / Albany', '94707': 'Berkeley', '94708': 'Berkeley', '94709': 'Berkeley', '94710': 'Berkeley',
  // Richmond
  '94801': 'Richmond', '94803': 'Richmond', '94804': 'Richmond', '94805': 'Richmond', '94806': 'Richmond',
  // San Francisco
  '94102': 'San Francisco', '94103': 'San Francisco', '94104': 'San Francisco', '94105': 'San Francisco', '94107': 'San Francisco', '94108': 'San Francisco', '94109': 'San Francisco', '94110': 'San Francisco', '94111': 'San Francisco', '94112': 'San Francisco', '94114': 'San Francisco', '94115': 'San Francisco', '94116': 'San Francisco', '94117': 'San Francisco', '94118': 'San Francisco', '94121': 'San Francisco', '94122': 'San Francisco', '94123': 'San Francisco', '94124': 'San Francisco', '94127': 'San Francisco', '94129': 'San Francisco', '94130': 'San Francisco', '94131': 'San Francisco', '94132': 'San Francisco', '94133': 'San Francisco', '94134': 'San Francisco',
  // Pinole
  '94564': 'Pinole',
  // El Cerrito / San Pablo
  '94530': 'El Cerrito',
  // Hercules / Rodeo
  '94547': 'Hercules', '94572': 'Rodeo',
  // Vallejo
  '94589': 'Vallejo', '94590': 'Vallejo', '94591': 'Vallejo', '94592': 'Vallejo',
  // Concord
  '94518': 'Concord', '94519': 'Concord', '94520': 'Concord', '94521': 'Concord',
  // Walnut Creek
  '94595': 'Walnut Creek', '94596': 'Walnut Creek', '94597': 'Walnut Creek', '94598': 'Walnut Creek',
  // Pleasant Hill / Martinez
  '94523': 'Pleasant Hill', '94553': 'Martinez',
  // Hayward
  '94541': 'Hayward', '94542': 'Hayward', '94544': 'Hayward', '94545': 'Hayward',
  // Fremont
  '94536': 'Fremont', '94538': 'Fremont', '94539': 'Fremont', '94555': 'Fremont',
  // San Leandro
  '94577': 'San Leandro', '94578': 'San Leandro', '94579': 'San Leandro',
  // Castro Valley
  '94546': 'Castro Valley',
  // Union City
  '94587': 'Union City',
  // Napa
  '94558': 'Napa', '94559': 'Napa',
  // Santa Rosa
  '95401': 'Santa Rosa', '95402': 'Santa Rosa', '95403': 'Santa Rosa', '95404': 'Santa Rosa', '95405': 'Santa Rosa', '95407': 'Santa Rosa', '95409': 'Santa Rosa',
  // Vacaville / Fairfield
  '94533': 'Fairfield', '94534': 'Fairfield', '95687': 'Vacaville', '95688': 'Vacaville',
  // San Rafael / Novato
  '94901': 'San Rafael', '94903': 'San Rafael', '94945': 'Novato', '94947': 'Novato', '94949': 'Novato',
  // Petaluma
  '94952': 'Petaluma', '94954': 'Petaluma',
  // Millbrae / San Bruno
  '94010': 'Millbrae', '94066': 'San Bruno',
  // Orinda / Lafayette
  '94549': 'Lafayette', '94563': 'Orinda',
  // Knightsen
  '94548': 'Knightsen',
  // Milpitas
  '95035': 'Milpitas',
};

const STATUS_COLORS = {
  scheduled: '#60a5fa',
  in_transit: '#ffb77d',
  delivered: '#999999',
  pickup_ready: '#00b5fc',
  picked_up: '#85cfff',
  completed: '#999999',
  cancelled: '#ffb4ab',
};

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useApp();
  const { bookings, dumpsters } = state;
  const [zipCode, setZipCode] = useState('');
  const [zipResult, setZipResult] = useState(null); // null, false, or city name string

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const monthBookings = bookings.filter(b => b.status !== 'cancelled' && (b.deliveryDate || '') >= currentMonth + '-01' && (b.deliveryDate || '') <= today);
    const totalRevenue = monthBookings.reduce((sum, b) => sum + (b.total || 0), 0);

    // Revenue by sales rep
    const repRevenue = {};
    monthBookings.forEach(b => {
      const rep = b.generatedBy || b.source || 'unknown';
      if (!repRevenue[rep]) repRevenue[rep] = 0;
      repRevenue[rep] += b.total || 0;
    });
    const activeBookings = bookings.filter(b => !['completed', 'cancelled'].includes(b.status));
    const completedBookings = bookings.filter(b => b.status === 'completed');
    const availableUnits = dumpsters.filter(d => d.status === 'available').length;
    const deployedUnits = dumpsters.filter(d => d.status === 'deployed').length;
    const maintenanceUnits = dumpsters.filter(d => d.status === 'maintenance').length;
    const totalUnits = dumpsters.length;
    const availablePercent = totalUnits > 0 ? (availableUnits / totalUnits) * 100 : 0;
    const revenueChange = 12.5;

    return {
      totalRevenue,
      activeCount: activeBookings.length,
      completedCount: completedBookings.length,
      availableUnits,
      deployedUnits,
      maintenanceUnits,
      totalUnits,
      availablePercent,
      revenueChange,
      repRevenue,
    };
  }, [bookings, dumpsters]);

  const recentBookings = useMemo(() => {
    return [...bookings]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);
  }, [bookings]);

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{
            color: '#1A1A1A',
            fontSize: 32,
            fontWeight: '800',
            letterSpacing: -0.5,
            marginBottom: 4,
          }}>
            Fleet Overview
          </Text>
          <Text style={{ color: '#666666', fontWeight: '500', fontSize: 14 }}>
            Real-time logistics and revenue tracking
          </Text>
        </View>

        {/* ZIP Code Search */}
        <View style={{ backgroundColor: '#F7F7F7', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: '#666666', fontSize: 10, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            Service Area Check
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8E8E8', borderRadius: 10, paddingHorizontal: 14 }}>
              <Ionicons name="search" size={18} color="#999999" />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, color: '#1A1A1A', fontSize: 16 }}
                value={zipCode}
                onChangeText={(val) => {
                  setZipCode(val.replace(/\D/g, '').slice(0, 5));
                  if (val.length < 5) setZipResult(null);
                }}
                placeholder="Enter ZIP code..."
                placeholderTextColor="#999999"
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <TouchableOpacity
              onPress={() => {
                if (zipCode.length === 5) {
                  const city = SERVICE_ZIPS[zipCode];
                  setZipResult(city ? city : false);
                }
              }}
              style={{ backgroundColor: '#ff8c00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 14 }}>Check</Text>
            </TouchableOpacity>
          </View>
          {typeof zipResult === 'string' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: 'rgba(133,207,255,0.1)', padding: 10, borderRadius: 8 }}>
              <Ionicons name="checkmark-circle" size={20} color="#85cfff" />
              <Text style={{ color: '#85cfff', fontWeight: '700', fontSize: 14 }}>{zipCode} — {zipResult}, CA  ✅ We service this area!</Text>
            </View>
          )}
          {zipResult === false && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: 'rgba(255,180,171,0.1)', padding: 10, borderRadius: 8 }}>
              <Ionicons name="close-circle" size={20} color="#ffb4ab" />
              <Text style={{ color: '#ffb4ab', fontWeight: '700', fontSize: 14 }}>Outside service area</Text>
            </View>
          )}
        </View>

        {/* Revenue Card */}
        <TouchableOpacity
          onPress={() => router.push('/revenue')}
          activeOpacity={0.85}
          style={{
          backgroundColor: '#F7F7F7',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
          minHeight: 200,
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Orange glow */}
          <View style={{
            position: 'absolute',
            right: -40,
            top: -40,
            width: 160,
            height: 160,
            borderRadius: 80,
            backgroundColor: '#ff8c00',
            opacity: 0.08,
          }} />

          <Text style={{
            color: '#666666',
            fontSize: 10,
            fontWeight: '600',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Total Revenue
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{
              color: '#ffb77d',
              fontSize: 48,
              fontWeight: '800',
              letterSpacing: -1,
            }}>
              {formatCurrency(stats.totalRevenue)}
            </Text>
            <Text style={{ color: '#85cfff', fontWeight: '700', fontSize: 14 }}>
              +{stats.revenueChange}%
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
            <View style={{
              backgroundColor: '#E8E8E8',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}>
              <Text style={{
                color: '#666666',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Active Bookings
              </Text>
              <Text style={{ color: '#1A1A1A', fontSize: 20, fontWeight: '800' }}>
                {stats.activeCount}
              </Text>
            </View>
            <View style={{
              backgroundColor: '#E8E8E8',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}>
              <Text style={{
                color: '#666666',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Completed
              </Text>
              <Text style={{ color: '#85cfff', fontSize: 20, fontWeight: '800' }}>
                {stats.completedCount}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Sales Rep Breakdown */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {Object.entries(stats.repRevenue || {}).sort((a, b) => b[1] - a[1]).map(([rep, rev]) => {
            const displayName = rep === 'asai' ? 'Asai' : rep === 'tiago' ? 'Tiago' : rep === 'phone' ? 'Asai (Phone)' : rep === 'website' ? 'Asai (Web)' : rep;
            return (
            <View key={rep} style={{ flex: 1, backgroundColor: '#F7F7F7', borderRadius: 12, padding: 14 }}>
              <Text style={{ color: '#999999', fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                {displayName}
              </Text>
              <Text style={{ color: '#FF8C00', fontSize: 20, fontWeight: '800' }}>
                {formatCurrency(rev)}
              </Text>
            </View>
          )})}
        </View>

        {/* Fleet Readiness Card */}
        <View style={{
          backgroundColor: '#EEEEEE',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
        }}>
          <Text style={{
            color: '#1A1A1A',
            fontSize: 18,
            fontWeight: '800',
            letterSpacing: -0.5,
            marginBottom: 20,
          }}>
            Fleet Readiness
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#85cfff' }} />
              <Text style={{ color: '#1A1A1A', fontWeight: '500', fontSize: 14 }}>Available Units</Text>
            </View>
            <Text style={{ color: '#1A1A1A', fontSize: 22, fontWeight: '800' }}>
              {stats.availableUnits}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{
            width: '100%',
            height: 6,
            backgroundColor: '#F0F0F0',
            borderRadius: 3,
            overflow: 'hidden',
            marginBottom: 20,
          }}>
            <View style={{
              width: `${stats.availablePercent}%`,
              height: '100%',
              backgroundColor: '#85cfff',
              borderRadius: 3,
            }} />
          </View>

          {/* Deployed / Maintenance */}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#666666',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Deployed
              </Text>
              <Text style={{ color: '#ffb77d', fontSize: 20, fontWeight: '800' }}>
                {stats.deployedUnits}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#666666',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Maintenance
              </Text>
              <Text style={{ color: '#ffb4ab', fontSize: 20, fontWeight: '800' }}>
                {stats.maintenanceUnits}
              </Text>
            </View>
          </View>
        </View>

        {/* Live Unit Tracking */}
        <View style={{
          backgroundColor: '#F7F7F7',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
          minHeight: 160,
          justifyContent: 'space-between',
        }}>
          <View>
            <Text style={{
              color: '#1A1A1A',
              fontSize: 16,
              fontWeight: '800',
              letterSpacing: -0.5,
              marginBottom: 4,
            }}>
              Live Unit Tracking
            </Text>
            <Text style={{ color: '#666666', fontSize: 12, fontWeight: '400' }}>
              {stats.deployedUnits} Active units in service area
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/map')}
            style={{
              backgroundColor: '#ff8c00',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 20,
              alignSelf: 'flex-end',
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={18} color="#4d2600" />
            <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 14 }}>
              OPEN FLEET MAP
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pending Reviews Card */}
        <TouchableOpacity
          onPress={() => router.push('/pending-reviews')}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#F7F7F7',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: '#ffb77d',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
          }}>
            <Ionicons name="star-outline" size={22} color="#4d2600" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1A1A1A', fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }}>
              Pending Reviews
            </Text>
            <Text style={{ color: '#666666', fontSize: 12, marginTop: 2 }}>
              {(() => {
                const count = (state.bookings || []).filter(
                  (b) =>
                    ['on_site', 'completed', 'picked_up', 'ready_for_pickup', 'dumping'].includes(b.status) &&
                    !b.reviewRequestedAt
                ).length;
                return count === 0
                  ? 'All caught up 🎉'
                  : `${count} customer${count === 1 ? '' : 's'} to ask for a review`;
              })()}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        {/* Recent Bookings */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{
              color: '#1A1A1A',
              fontSize: 16,
              fontWeight: '800',
              letterSpacing: -0.5,
            }}>
              Recent Bookings
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/bookings')}>
              <Text style={{
                color: '#ff8c00',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}>
                View All
              </Text>
            </TouchableOpacity>
          </View>

          {recentBookings.map((booking) => {
            const borderColor = STATUS_COLORS[booking.status] || '#999999';
            return (
              <TouchableOpacity
                key={booking.id}
                onPress={() => router.push(`/booking/${booking.id}`)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: '#E8E8E8',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 10,
                  borderLeftWidth: 4,
                  borderLeftColor: borderColor,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <View>
                    <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: '800' }}>
                      {booking.customerName}
                    </Text>
                    <Text style={{ color: '#666666', fontSize: 12, marginTop: 2 }}>
                      {booking.dumpsterSize ? `${booking.dumpsterSize.replace('yd', '')}-Yard Dumpster` : 'Dumpster'}
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: `${borderColor}20`,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 9999,
                  }}>
                    <Text style={{
                      color: borderColor,
                      fontSize: 9,
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {(booking.status || '').replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="location-outline" size={12} color="#666666" />
                  <Text style={{ color: '#666666', fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
                    {booking.deliveryAddress}
                  </Text>
                </View>

                <View style={{
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(86, 67, 52, 0.1)',
                  paddingTop: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <Text style={{ color: '#ffb77d', fontWeight: '700', fontSize: 15 }}>
                    ${booking.total?.toFixed(2)}
                  </Text>
                  <Text style={{
                    color: '#666666',
                    fontSize: 10,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                  }}>
                    {booking.deliveryDate || booking.createdAt}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
