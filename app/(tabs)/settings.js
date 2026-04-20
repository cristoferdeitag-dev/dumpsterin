import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { useAuth } from '../../src/context/AuthContext';
import { COMPANY } from '../../src/data/mockData';
import {
  bg,
  bgCard,
  border,
  primary,
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

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que quieres salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
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

        {/* Pricing */}
        <SectionCard title="Pricing" icon="pricetag-outline">
          <InfoRow
            label="Web Discount"
            value={`${COMPANY.webDiscount}%`}
            icon="gift-outline"
          />
          <InfoRow
            label="Cancellation Fee"
            value={`$${COMPANY.cancellationFee}`}
            icon="close-circle-outline"
          />
          <InfoRow
            label="Overweight Fee"
            value={`$${COMPANY.overweightFee}`}
            icon="warning-outline"
          />
          <InfoRow
            label="Extra Day Fee"
            value="$49/day"
            icon="calendar-outline"
          />
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

        {/* App Info */}
        <SectionCard title="App Info" icon="information-circle-outline">
          <InfoRow label="Version" value="1.0.0" icon="code-slash-outline" />
          <InfoRow label="Platform" value="Expo / React Native" icon="phone-portrait-outline" />
          <View style={styles.poweredBy}>
            <Ionicons name="rocket-outline" size={16} color={primary} />
            <Text style={styles.poweredByText}>Powered by Dumpsterin</Text>
          </View>
        </SectionCard>

        {/* Usuario / Cerrar sesión */}
        {user && (
          <SectionCard title="Tu cuenta" icon="person-circle-outline">
            <InfoRow label="Email" value={user.email} icon="mail-outline" />
            {profile?.full_name && <InfoRow label="Nombre" value={profile.full_name} icon="person-outline" />}
            {companyName && <InfoRow label="Empresa" value={companyName} icon="business-outline" />}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color={danger} />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
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
