import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme/colors';

export default function MapScreen() {
  const router = useRouter();
  const { state } = useApp();

  const deployedDumpsters = (state.dumpsters || []).filter(
    (d) => d.status === 'deployed'
  );

  const getBookingForDumpster = (dumpsterId) => {
    return (state.bookings || []).find(
      (b) => b.assignedDumpster === dumpsterId
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Fleet Map</Text>

        {/* Map Placeholder */}
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={64} color={colors.textMuted} />
          <Text style={styles.placeholderTitle}>Map View</Text>
          <Text style={styles.placeholderText}>
            Map view requires Google Maps API integration. Deployed dumpsters
            and driver locations will appear here.
          </Text>
        </View>

        {/* Deployed Dumpsters */}
        <Text style={styles.sectionTitle}>
          Deployed Dumpsters ({deployedDumpsters.length})
        </Text>

        {deployedDumpsters.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No dumpsters currently deployed</Text>
          </View>
        ) : (
          deployedDumpsters.map((dumpster) => {
            const booking = getBookingForDumpster(dumpster.id);
            return (
              <View key={dumpster.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Ionicons
                      name="location"
                      size={22}
                      color={colors.primary}
                      style={styles.locationIcon}
                    />
                    <View>
                      <Text style={styles.dumpsterId}>{dumpster.id}</Text>
                      <Text style={styles.dumpsterSize}>
                        {dumpster.size || 'N/A'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.statusBadge}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: colors.success },
                      ]}
                    />
                    <Text style={styles.statusText}>Deployed</Text>
                  </View>
                </View>

                {booking ? (
                  <View style={styles.bookingInfo}>
                    <View style={styles.infoRow}>
                      <Ionicons
                        name="document-text-outline"
                        size={16}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.infoLabel}>Booking:</Text>
                      <Text style={styles.infoValue}>{booking.id}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons
                        name="person-outline"
                        size={16}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.infoLabel}>Customer:</Text>
                      <Text style={styles.infoValue}>
                        {booking.customerName}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Ionicons
                        name="navigate-outline"
                        size={16}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.infoLabel}>Address:</Text>
                      <Text style={styles.infoValue} numberOfLines={2}>
                        {booking.deliveryAddress}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.bookingInfo}>
                    <Text style={styles.noBookingText}>
                      No linked booking found
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  mapPlaceholder: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    marginBottom: 24,
    minHeight: 240,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    marginRight: 10,
  },
  dumpsterId: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dumpsterSize: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  bookingInfo: {
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
    padding: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 8,
    marginRight: 6,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  noBookingText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
