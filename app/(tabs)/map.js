import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme/colors';

const GOOGLE_MAPS_KEY = 'AIzaSyAWkJznwQtNDv_MhFhdYvqBdfzAa3IIMew';
const TP_BASE = { lat: 37.9994, lng: -122.3519, label: 'TP Dumpsters HQ' };
const BAY_AREA_CENTER = { lat: 37.85, lng: -122.25 };

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

  const deployedDumpsters = (state.dumpsters || []).filter(d => d.status === 'deployed');

  const getBookingForDumpster = (dumpsterId) =>
    (state.bookings || []).find(b => b.assignedDumpster === dumpsterId);

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
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0D0D0D' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2A2A' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#888' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d2d3d' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#446477' }] },
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
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
      const booking = getBookingForDumpster(d.id);
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
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>HQ</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Delivered</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.info }]} />
            <Text style={styles.legendText}>Scheduled</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.legendText}>In Transit</Text>
          </View>
        </View>
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
              const booking = getBookingForDumpster(d.id);
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
    minHeight: 350,
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
