import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme/colors';

const STATUS_COLORS = {
  pending: colors.warning,
  confirmed: colors.info,
  'in-transit': colors.primaryLight,
  deployed: colors.success,
  'pickup-scheduled': colors.info,
  completed: colors.textMuted,
  cancelled: colors.danger,
};

function getWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Monday = 0 offset
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const days = [];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    days.push({
      label: dayLabels[i],
      date: date.getDate(),
      fullDate: date.toISOString().split('T')[0],
      isToday:
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear(),
    });
  }

  return days;
}

function formatDateHeader(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || colors.textMuted;
}

function formatStatus(status) {
  if (!status) return 'Unknown';
  return status
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ScheduleScreen() {
  const router = useRouter();
  const { state } = useApp();
  const weekDays = useMemo(() => getWeekDays(), []);

  const groupedBookings = useMemo(() => {
    const bookings = [...(state.bookings || [])];

    // Sort by deliveryDate ascending
    bookings.sort((a, b) => {
      if (a.deliveryDate < b.deliveryDate) return -1;
      if (a.deliveryDate > b.deliveryDate) return 1;
      return 0;
    });

    // Group by date
    const groups = {};
    bookings.forEach((booking) => {
      const date = booking.deliveryDate;
      if (!date) return;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(booking);
    });

    // Convert to sorted array of sections
    return Object.keys(groups)
      .sort()
      .map((date) => ({
        date,
        label: formatDateHeader(date),
        bookings: groups[date],
      }));
  }, [state.bookings]);

  const getDriverName = (driverId) => {
    if (!driverId) return 'Unassigned';
    const driver = (state.drivers || []).find((d) => d.id === driverId);
    return driver ? driver.name : driverId;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Schedule</Text>

        {/* Week Day Row */}
        <View style={styles.weekRow}>
          {weekDays.map((day) => (
            <View
              key={day.fullDate}
              style={[
                styles.dayCell,
                day.isToday && styles.dayCellToday,
              ]}
            >
              <Text
                style={[
                  styles.dayLabel,
                  day.isToday && styles.dayLabelToday,
                ]}
              >
                {day.label}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  day.isToday && styles.dayNumberToday,
                ]}
              >
                {day.date}
              </Text>
            </View>
          ))}
        </View>

        {/* Bookings by Date */}
        {groupedBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyTitle}>No Bookings</Text>
            <Text style={styles.emptyText}>
              Scheduled bookings will appear here organized by date.
            </Text>
          </View>
        ) : (
          groupedBookings.map((section) => (
            <View key={section.date} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="calendar"
                  size={16}
                  color={colors.primary}
                  style={styles.sectionIcon}
                />
                <Text style={styles.sectionDate}>{section.label}</Text>
                <View style={styles.sectionCountBadge}>
                  <Text style={styles.sectionCount}>
                    {section.bookings.length}
                  </Text>
                </View>
              </View>

              {section.bookings.map((booking) => (
                <View key={booking.id} style={styles.bookingCard}>
                  {/* Time Window */}
                  {booking.deliveryWindow && (
                    <View style={styles.timeRow}>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={colors.primary}
                      />
                      <Text style={styles.timeText}>
                        {booking.deliveryWindow}
                      </Text>
                    </View>
                  )}

                  {/* Customer & Status */}
                  <View style={styles.bookingHeader}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {booking.customerName}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: `${getStatusColor(booking.status)}20`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: getStatusColor(booking.status) },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusLabel,
                          { color: getStatusColor(booking.status) },
                        ]}
                      >
                        {formatStatus(booking.status)}
                      </Text>
                    </View>
                  </View>

                  {/* Details */}
                  <View style={styles.detailsContainer}>
                    <View style={styles.detailRow}>
                      <Ionicons
                        name="navigate-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {booking.deliveryAddress}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Ionicons
                        name="cube-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.detailText}>
                        {booking.dumpsterSize}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.detailText,
                          !booking.assignedDriver && styles.unassignedText,
                        ]}
                      >
                        {getDriverName(booking.assignedDriver)}
                      </Text>
                    </View>
                  </View>

                  {/* Total */}
                  {booking.total != null && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalValue}>
                        ${Number(booking.total).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))
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

  // Week Row
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginBottom: 24,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  dayCellToday: {
    backgroundColor: colors.primary,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dayLabelToday: {
    color: '#FFFFFF',
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dayNumberToday: {
    color: '#FFFFFF',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionDate: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  sectionCountBadge: {
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Booking Card
  bookingCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 6,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Details
  detailsContainer: {
    backgroundColor: colors.bgElevated,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  detailText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  unassignedText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // Total
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.success,
  },
});
