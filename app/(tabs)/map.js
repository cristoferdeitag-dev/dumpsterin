import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme/colors';

const GOOGLE_MAPS_KEY = 'AIzaSyAWkJznwQtNDv_MhFhdYvqBdfzAa3IIMew';
const TP_BASE = { lat: 37.9994, lng: -122.3519, label: 'TP Dumpsters HQ' };
const BAY_AREA_CENTER = { lat: 37.85, lng: -122.25 };

const SERVICE_ZIPS = {
  '94601': 'Oakland', '94602': 'Oakland', '94603': 'Oakland', '94605': 'Oakland', '94606': 'Oakland', '94607': 'Oakland', '94608': 'Oakland', '94609': 'Oakland', '94610': 'Oakland', '94611': 'Oakland', '94612': 'Oakland', '94613': 'Oakland', '94618': 'Oakland', '94619': 'Oakland', '94621': 'Oakland',
  '94702': 'Berkeley', '94703': 'Berkeley', '94704': 'Berkeley', '94705': 'Berkeley', '94706': 'Berkeley / Albany', '94707': 'Berkeley', '94708': 'Berkeley', '94709': 'Berkeley', '94710': 'Berkeley',
  '94801': 'Richmond', '94803': 'Richmond', '94804': 'Richmond', '94805': 'Richmond', '94806': 'Richmond',
  '94102': 'San Francisco', '94103': 'San Francisco', '94104': 'San Francisco', '94105': 'San Francisco', '94107': 'San Francisco', '94108': 'San Francisco', '94109': 'San Francisco', '94110': 'San Francisco', '94111': 'San Francisco', '94112': 'San Francisco', '94114': 'San Francisco', '94115': 'San Francisco', '94116': 'San Francisco', '94117': 'San Francisco', '94118': 'San Francisco', '94121': 'San Francisco', '94122': 'San Francisco', '94123': 'San Francisco', '94124': 'San Francisco', '94127': 'San Francisco', '94129': 'San Francisco', '94130': 'San Francisco', '94131': 'San Francisco', '94132': 'San Francisco', '94133': 'San Francisco', '94134': 'San Francisco',
  '94564': 'Pinole', '94530': 'El Cerrito', '94547': 'Hercules', '94572': 'Rodeo',
  '94589': 'Vallejo', '94590': 'Vallejo', '94591': 'Vallejo', '94592': 'Vallejo',
  '94518': 'Concord', '94519': 'Concord', '94520': 'Concord', '94521': 'Concord',
  '94595': 'Walnut Creek', '94596': 'Walnut Creek', '94597': 'Walnut Creek', '94598': 'Walnut Creek',
  '94523': 'Pleasant Hill', '94553': 'Martinez',
  '94541': 'Hayward', '94542': 'Hayward', '94544': 'Hayward', '94545': 'Hayward',
  '94536': 'Fremont', '94538': 'Fremont', '94539': 'Fremont', '94555': 'Fremont',
  '94577': 'San Leandro', '94578': 'San Leandro', '94579': 'San Leandro',
  '94546': 'Castro Valley', '94587': 'Union City', '94558': 'Napa', '94559': 'Napa',
  '95401': 'Santa Rosa', '95402': 'Santa Rosa', '95403': 'Santa Rosa', '95404': 'Santa Rosa', '95405': 'Santa Rosa', '95407': 'Santa Rosa', '95409': 'Santa Rosa',
  '94533': 'Fairfield', '94534': 'Fairfield', '95687': 'Vacaville', '95688': 'Vacaville',
  '94901': 'San Rafael', '94903': 'San Rafael', '94945': 'Novato', '94947': 'Novato', '94949': 'Novato',
  '94952': 'Petaluma', '94954': 'Petaluma', '94010': 'Millbrae', '94066': 'San Bruno',
  '94549': 'Lafayette', '94563': 'Orinda', '94548': 'Knightsen', '95035': 'Milpitas',
};

const STATUS_COLORS = {
  scheduled: '#2196F3',
  in_transit: '#FFB300',
  delivered: '#00C853',
  pickup_ready: '#FF8C3A',
  picked_up: '#1976D2',
  completed: '#4A6741',
  cancelled: '#FF3D00',
};

export default function MapScreen() {
  const router = useRouter();
  const { state } = useApp();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedDumpster, setSelectedDumpster] = useState(null);
  const [zipCode, setZipCode] = useState('');
  const [zipResult, setZipResult] = useState(null);
  const zipCircleRef = useRef(null);
  const zipMarkerRef = useRef(null);

  const searchZipOnMap = () => {
    if (zipCode.length !== 5 || !mapInstanceRef.current || Platform.OS !== 'web') return;
    const city = SERVICE_ZIPS[zipCode];
    setZipResult(city || false);

    // Remove previous circle/marker
    if (zipCircleRef.current) { zipCircleRef.current.setMap(null); zipCircleRef.current = null; }
    if (zipMarkerRef.current) { zipMarkerRef.current.setMap(null); zipMarkerRef.current = null; }

    // Geocode the ZIP
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: zipCode + ', USA' }, (results, status) => {
      if (status !== 'OK' || !results[0]) return;
      const pos = results[0].geometry.location;
      const map = mapInstanceRef.current;

      // Extract city name from geocode result
      let geoCity = '';
      const components = results[0].address_components || [];
      for (const comp of components) {
        if (comp.types.includes('locality')) { geoCity = comp.long_name; break; }
        if (comp.types.includes('sublocality')) { geoCity = comp.long_name; }
        if (!geoCity && comp.types.includes('administrative_area_level_2')) { geoCity = comp.long_name; }
      }
      const displayCity = city || geoCity || 'Unknown';
      setZipResult(city ? city : (geoCity ? '!' + geoCity : false));

      // Draw circle
      zipCircleRef.current = new window.google.maps.Circle({
        map,
        center: pos,
        radius: 3000,
        fillColor: city ? '#85cfff' : '#ff5252',
        fillOpacity: 0.15,
        strokeColor: city ? '#85cfff' : '#ff5252',
        strokeWeight: 2,
        strokeOpacity: 0.6,
      });

      // Place marker
      zipMarkerRef.current = new window.google.maps.Marker({
        position: pos,
        map,
        title: `${zipCode} — ${displayCity}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: city ? '#85cfff' : '#ff5252',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });

      const infoContent = city
        ? `<div style="font-family:system-ui;padding:4px"><b style="color:#00b5fc">${zipCode} — ${displayCity}, CA</b><br/><span style="color:green">✅ We service this area!</span></div>`
        : `<div style="font-family:system-ui;padding:4px"><b>${zipCode} — ${displayCity}</b><br/><span style="color:red">❌ Outside service area</span></div>`;
      const infoWindow = new window.google.maps.InfoWindow({ content: infoContent });
      infoWindow.open(map, zipMarkerRef.current);

      map.panTo(pos);
      map.setZoom(city ? 12 : 10);
    });
  };

  const deployedDumpsters = (state.dumpsters || []).filter(d => d.status === 'deployed');

  const getBookingForDumpster = (dumpster) =>
    (state.bookings || []).find(b =>
      b.assignedDumpster === dumpster.id ||
      b.assignedDumpster === dumpster._dbId ||
      b.assignedDumpster === dumpster.label
    );

  // Load Google Maps script
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (window.google && window.google.maps) {
      initMap();
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener('load', initMap);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places,geocoding`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: BAY_AREA_CENTER,
      zoom: 10,
      mapId: 'dumpsterin-fleet',
      styles: [],
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
    });
    mapInstanceRef.current = map;

    // TP Dumpsters HQ marker
    new window.google.maps.Marker({
      position: { lat: TP_BASE.lat, lng: TP_BASE.lng },
      map,
      title: TP_BASE.label,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#FF6B00',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
      },
    });

    setMapReady(true);
  };

  // Geocode and place markers for deployed dumpsters
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || Platform.OS !== 'web') return;
    const map = mapInstanceRef.current;
    const geocoder = new window.google.maps.Geocoder();

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: TP_BASE.lat, lng: TP_BASE.lng });

    deployedDumpsters.forEach((d) => {
      const booking = getBookingForDumpster(d);
      if (!booking || !booking.deliveryAddress) return;

      geocoder.geocode({ address: booking.deliveryAddress }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const pos = results[0].geometry.location;
          const marker = new window.google.maps.Marker({
            position: pos,
            map,
            title: `${d.id} — ${booking.customerName}`,
            icon: {
              path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
              fillColor: STATUS_COLORS[booking.status] || '#FF6B00',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 1.5,
              scale: 1.8,
              anchor: new window.google.maps.Point(12, 22),
            },
          });

          const infoContent = `
            <div style="font-family:system-ui;padding:4px;min-width:180px">
              <div style="font-weight:700;font-size:14px;color:#FF6B00">${d.id}</div>
              <div style="font-size:13px;margin-top:4px"><b>${booking.customerName}</b></div>
              <div style="font-size:12px;color:#666;margin-top:2px">${booking.deliveryAddress}</div>
              <div style="font-size:12px;color:#666;margin-top:2px">${d.sizeLabel} · ${booking.status}</div>
            </div>
          `;
          const infoWindow = new window.google.maps.InfoWindow({ content: infoContent });
          marker.addListener('click', () => {
            infoWindow.open(map, marker);
            setSelectedDumpster(d.id);
          });

          markersRef.current.push(marker);
          bounds.extend(pos);

          if (markersRef.current.length === deployedDumpsters.length) {
            map.fitBounds(bounds, 60);
          }
        }
      });
    });

    if (deployedDumpsters.length === 0) {
      map.setCenter(BAY_AREA_CENTER);
      map.setZoom(10);
    }
  }, [mapReady, deployedDumpsters.length, state.bookings]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Fleet Map</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ff8c00' }]} />
            <Text style={styles.legendText}>HQ</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#85cfff' }]} />
            <Text style={styles.legendText}>Delivered</Text>
          </View>
        </View>
      </View>

      {/* ZIP Code Search */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEEEEE', borderRadius: 10, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={16} color="#999999" />
            <TextInput
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: '#1A1A1A', fontSize: 16 }}
              value={zipCode}
              onChangeText={(val) => {
                setZipCode(val.replace(/\D/g, '').slice(0, 5));
                if (val.length < 5) setZipResult(null);
              }}
              placeholder="Search ZIP code..."
              placeholderTextColor="#999999"
              keyboardType="numeric"
              maxLength={5}
              onSubmitEditing={searchZipOnMap}
            />
          </View>
          <TouchableOpacity onPress={searchZipOnMap} style={{ backgroundColor: '#ff8c00', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
            <Text style={{ color: '#4d2600', fontWeight: '700', fontSize: 13 }}>Check</Text>
          </TouchableOpacity>
        </View>
        {typeof zipResult === 'string' && !zipResult.startsWith('!') && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color="#85cfff" />
            <Text style={{ color: '#85cfff', fontWeight: '700', fontSize: 12 }}>{zipCode} — {zipResult}, CA — We service this area!</Text>
          </View>
        )}
        {typeof zipResult === 'string' && zipResult.startsWith('!') && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Ionicons name="close-circle" size={16} color="#ffb4ab" />
            <Text style={{ color: '#ffb4ab', fontWeight: '700', fontSize: 12 }}>{zipCode} — {zipResult.slice(1)} — Outside service area</Text>
          </View>
        )}
        {zipResult === false && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Ionicons name="close-circle" size={16} color="#ffb4ab" />
            <Text style={{ color: '#ffb4ab', fontWeight: '700', fontSize: 12 }}>{zipCode} — Outside service area</Text>
          </View>
        )}
      </View>

      {/* Google Map */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={48} color={colors.textMuted} />
            <Text style={styles.mapFallbackText}>Map available on web only</Text>
          </View>
        )}
      </View>

      {/* Deployed list */}
      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>
          Deployed ({deployedDumpsters.length})
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {deployedDumpsters.length === 0 ? (
            <View style={styles.emptyChip}>
              <Text style={styles.emptyChipText}>No dumpsters deployed</Text>
            </View>
          ) : (
            deployedDumpsters.map((d) => {
              const booking = getBookingForDumpster(d);
              const isSelected = selectedDumpster === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.dumpsterChip, isSelected && styles.dumpsterChipActive]}
                  onPress={() => {
                    setSelectedDumpster(d.id);
                    if (booking) router.push(`/booking/${booking.id}`);
                  }}
                >
                  <Ionicons name="location" size={16} color={isSelected ? colors.primary : colors.textSecondary} />
                  <View>
                    <Text style={[styles.chipId, isSelected && { color: colors.primary }]}>{d.id}</Text>
                    <Text style={styles.chipCustomer} numberOfLines={1}>
                      {booking ? booking.customerName : 'Unknown'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 300,
    maxHeight: 450,
  },
  mapFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  mapFallbackText: { fontSize: 14, color: colors.textMuted, marginTop: 8 },

  listSection: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  chipScroll: { gap: 10, paddingBottom: 8 },
  dumpsterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgCard, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.border,
    minWidth: 150,
  },
  dumpsterChipActive: {
    borderColor: colors.primary, backgroundColor: colors.primary + '15',
  },
  chipId: { fontSize: 14, fontWeight: '700', color: colors.text },
  chipCustomer: { fontSize: 11, color: colors.textMuted, maxWidth: 120 },
  emptyChip: {
    backgroundColor: colors.bgCard, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyChipText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
});
