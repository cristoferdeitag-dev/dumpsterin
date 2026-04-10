import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import {
  bg,
  bgCard,
  bgElevated,
  bgInput,
  border,
  primary,
  primaryLight,
  success,
  warning,
  danger,
  text,
  textSecondary,
  textMuted,
} from '../../src/theme/colors';

const FILTERS = ['All', 'Available', 'Deployed', 'Maintenance'];

const STATUS_CONFIG = {
  available: { color: success, label: 'Available' },
  deployed: { color: primary, label: 'Deployed' },
  maintenance: { color: danger, label: 'Maintenance' },
};

export default function InventoryScreen() {
  const { state, dispatch } = useApp();
  const [activeFilter, setActiveFilter] = useState('All');

  const dumpsters = state.dumpsters || [];

  const counts = useMemo(() => ({
    available: dumpsters.filter((d) => d.status === 'available').length,
    deployed: dumpsters.filter((d) => d.status === 'deployed').length,
    maintenance: dumpsters.filter((d) => d.status === 'maintenance').length,
  }), [dumpsters]);

  const filteredDumpsters = useMemo(() => {
    if (activeFilter === 'All') return dumpsters;
    return dumpsters.filter(
      (d) => d.status === activeFilter.toLowerCase()
    );
  }, [dumpsters, activeFilter]);

  const handleStatusChange = (dumpsterId, newStatus) => {
    dispatch({
      type: 'UPDATE_DUMPSTER',
      payload: { id: dumpsterId, status: newStatus },
    });
  };

  const handleAddDumpster = () => {
    const nextId = dumpsters.length + 1;
    const padded = String(nextId).padStart(2, '0');
    dispatch({
      type: 'ADD_DUMPSTER',
      payload: {
        id: `20YD-${padded}`,
        size: 20,
        sizeLabel: '20 Yard',
        status: 'available',
        assignedBooking: null,
      },
    });
  };

  const renderDumpsterCard = ({ item }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.available;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.dumpsterId}>{item.id}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '22' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
              <Text style={[styles.statusText, { color: statusCfg.color }]}>
                {statusCfg.label}
              </Text>
            </View>
          </View>
          <Text style={styles.sizeLabel}>{item.sizeLabel}</Text>
          {item.status === 'deployed' && item.assignedBooking && (
            <View style={styles.bookingRow}>
              <Ionicons name="document-text-outline" size={14} color={textSecondary} />
              <Text style={styles.bookingText}>
                Booking: {item.assignedBooking}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.statusActions}>
          <Text style={styles.statusActionsLabel}>Change status:</Text>
          <View style={styles.statusButtons}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const isActive = item.status === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.statusButton,
                    isActive && { backgroundColor: cfg.color + '33', borderColor: cfg.color },
                  ]}
                  onPress={() => handleStatusChange(item.id, key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.statusButtonText,
                      { color: isActive ? cfg.color : textMuted },
                    ]}
                  >
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Inventory</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{dumpsters.length}</Text>
          </View>
        </View>
      </View>

      {/* Summary badges */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryBadge, { backgroundColor: success + '1A' }]}>
          <View style={[styles.summaryDot, { backgroundColor: success }]} />
          <Text style={[styles.summaryCount, { color: success }]}>{counts.available}</Text>
          <Text style={styles.summaryLabel}>Available</Text>
        </View>
        <View style={[styles.summaryBadge, { backgroundColor: primary + '1A' }]}>
          <View style={[styles.summaryDot, { backgroundColor: primary }]} />
          <Text style={[styles.summaryCount, { color: primary }]}>{counts.deployed}</Text>
          <Text style={styles.summaryLabel}>Deployed</Text>
        </View>
        <View style={[styles.summaryBadge, { backgroundColor: danger + '1A' }]}>
          <View style={[styles.summaryDot, { backgroundColor: danger }]} />
          <Text style={[styles.summaryCount, { color: danger }]}>{counts.maintenance}</Text>
          <Text style={styles.summaryLabel}>Maintenance</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterContainer}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setActiveFilter(filter)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Dumpster list */}
      <FlatList
        data={filteredDumpsters}
        keyExtractor={(item) => item.id}
        renderItem={renderDumpsterCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={textMuted} />
            <Text style={styles.emptyText}>No dumpsters found</Text>
          </View>
        }
      />

      {/* FAB - Add Dumpster */}
      <TouchableOpacity style={styles.fab} onPress={handleAddDumpster} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color={text} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: text,
  },
  countBadge: {
    backgroundColor: primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: text,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  summaryBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryCount: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    color: textSecondary,
    flex: 1,
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: bgElevated,
    borderWidth: 1,
    borderColor: border,
  },
  filterTabActive: {
    backgroundColor: primary,
    borderColor: primary,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: textSecondary,
  },
  filterTabTextActive: {
    color: text,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: border,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dumpsterId: {
    fontSize: 18,
    fontWeight: '700',
    color: text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sizeLabel: {
    fontSize: 14,
    color: textSecondary,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  bookingText: {
    fontSize: 13,
    color: textSecondary,
  },
  statusActions: {
    borderTopWidth: 1,
    borderTopColor: border,
    paddingTop: 12,
  },
  statusActionsLabel: {
    fontSize: 12,
    color: textMuted,
    marginBottom: 8,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
    backgroundColor: bgInput,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: textMuted,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
