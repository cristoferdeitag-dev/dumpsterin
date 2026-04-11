import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';

// Bay Area ZIP codes served by TP Dumpsters
const SERVICE_ZIPS = new Set([
  // Oakland
  '94601','94602','94603','94605','94606','94607','94608','94609','94610','94611','94612','94613','94618','94619','94621',
  // Berkeley
  '94702','94703','94704','94705','94706','94707','94708','94709','94710',
  // Richmond
  '94801','94803','94804','94805','94806',
  // San Francisco
  '94102','94103','94104','94105','94107','94108','94109','94110','94111','94112','94114','94115','94116','94117','94118','94121','94122','94123','94124','94127','94129','94130','94131','94132','94133','94134',
  // Pinole
  '94564',
  // El Cerrito / Albany / San Pablo
  '94530','94706','94803','94806',
  // Hercules / Rodeo
  '94547','94572',
  // Vallejo
  '94589','94590','94591','94592',
  // Concord
  '94518','94519','94520','94521',
  // Walnut Creek
  '94595','94596','94597','94598',
  // Pleasant Hill / Martinez
  '94523','94553',
  // Hayward
  '94541','94542','94544','94545',
  // Fremont
  '94536','94538','94539','94555',
  // San Leandro
  '94577','94578','94579',
  // Castro Valley
  '94546',
  // Union City
  '94587',
  // Napa
  '94558','94559',
  // Santa Rosa
  '95401','95402','95403','95404','95405','95407','95409',
  // Vacaville / Fairfield
  '94533','94534','95687','95688',
  // San Rafael / Novato
  '94901','94903','94945','94947','94949',
  // Petaluma
  '94952','94954',
  // Millbrae / San Bruno
  '94010','94066',
  // Orinda / Lafayette
  '94549','94563',
  // Knightsen
  '94548',
  // Milpitas
  '95035',
]);

const STATUS_COLORS = {
  scheduled: '#60a5fa',
  in_transit: '#ffb77d',
  delivered: '#737373',
  pickup_ready: '#00b5fc',
  picked_up: '#85cfff',
  completed: '#737373',
  cancelled: '#ffb4ab',
};

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useApp();
  const { bookings, dumpsters } = state;
  const [zipCode, setZipCode] = useState('');
  const [zipResult, setZipResult] = useState(null); // null, true, false

  const stats = useMemo(() => {
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.total || 0), 0);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#131313' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{
            color: '#e5e2e1',
            fontSize: 32,
            fontWeight: '800',
            letterSpacing: -0.5,
            marginBottom: 4,
          }}>
            Fleet Overview
          </Text>
          <Text style={{ color: '#ddc1ae', fontWeight: '500', fontSize: 14 }}>
            Real-time logistics and revenue tracking
          </Text>
        </View>

        {/* ZIP Code Search */}
        <View style={{ backgroundColor: '#1c1b1b', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: '#ddc1ae', fontSize: 10, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            Service Area Check
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#353535', borderRadius: 10, paddingHorizontal: 14 }}>
              <Ionicons name="search" size={18} color="#737373" />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, color: '#e5e2e1', fontSize: 16 }}
                value={zipCode}
                onChangeText={(val) => {
                  setZipCode(val.replace(/\D/g, '').slice(0, 5));
                  if (val.length < 5) setZipResult(null);
                }}
                placeholder="Enter ZIP code..."
                placeholderTextColor="#737373"
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <TouchableOpacity
              onPress={() => {
                if (zipCode.length === 5) setZipResult(SERVICE_ZIPS.has(zipCode));
              }}
              style={{ backgroundColor: '#ff8c00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 14 }}>Check</Text>
            </TouchableOpacity>
          </View>
          {zipResult === true && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: 'rgba(133,207,255,0.1)', padding: 10, borderRadius: 8 }}>
              <Ionicons name="checkmark-circle" size={20} color="#85cfff" />
              <Text style={{ color: '#85cfff', fontWeight: '700', fontSize: 14 }}>We service this area!</Text>
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
          backgroundColor: '#1c1b1b',
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
            color: '#ddc1ae',
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
              backgroundColor: '#353535',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}>
              <Text style={{
                color: '#ddc1ae',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 2,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Active Bookings
              </Text>
              <Text style={{ color: '#e5e2e1', fontSize: 20, fontWeight: '800' }}>
                {stats.activeCount}
              </Text>
            </View>
            <View style={{
              backgroundColor: '#353535',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}>
              <Text style={{
                color: '#ddc1ae',
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

        {/* Fleet Readiness Card */}
        <View style={{
          backgroundColor: '#2a2a2a',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
        }}>
          <Text style={{
            color: '#e5e2e1',
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
              <Text style={{ color: '#e5e2e1', fontWeight: '500', fontSize: 14 }}>Available Units</Text>
            </View>
            <Text style={{ color: '#e5e2e1', fontSize: 22, fontWeight: '800' }}>
              {stats.availableUnits}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{
            width: '100%',
            height: 6,
            backgroundColor: '#0e0e0e',
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
                color: '#ddc1ae',
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
                color: '#ddc1ae',
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
          backgroundColor: '#1c1b1b',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
          minHeight: 160,
          justifyContent: 'space-between',
        }}>
          <View>
            <Text style={{
              color: '#e5e2e1',
              fontSize: 16,
              fontWeight: '800',
              letterSpacing: -0.5,
              marginBottom: 4,
            }}>
              Live Unit Tracking
            </Text>
            <Text style={{ color: '#ddc1ae', fontSize: 12, fontWeight: '400' }}>
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

        {/* Recent Bookings */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
            <Text style={{
              color: '#e5e2e1',
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
            const borderColor = STATUS_COLORS[booking.status] || '#737373';
            return (
              <TouchableOpacity
                key={booking.id}
                onPress={() => router.push(`/booking/${booking.id}`)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: '#353535',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 10,
                  borderLeftWidth: 4,
                  borderLeftColor: borderColor,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <View>
                    <Text style={{ color: '#e5e2e1', fontSize: 16, fontWeight: '800' }}>
                      {booking.customerName}
                    </Text>
                    <Text style={{ color: '#ddc1ae', fontSize: 12, marginTop: 2 }}>
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
                  <Ionicons name="location-outline" size={12} color="#ddc1ae" />
                  <Text style={{ color: '#ddc1ae', fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
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
                    color: '#ddc1ae',
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
