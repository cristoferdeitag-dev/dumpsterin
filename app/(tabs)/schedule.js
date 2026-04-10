import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme/colors';

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const HOUR_HEIGHT = 72;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS = {
  scheduled: colors.info,
  in_transit: colors.warning,
  delivered: colors.success,
  pickup_ready: colors.primaryLight,
  picked_up: colors.infoDark,
  completed: '#4A6741',
  cancelled: colors.danger,
};

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWindowHour(window) {
  switch (window) {
    case 'morning': return 7;
    case 'midday': return 11;
    case 'afternoon': return 15;
    case 'sameday': return 9;
    default: return 8;
  }
}

function getWindowDuration(window) {
  switch (window) {
    case 'morning': return 4; // 7-11
    case 'midday': return 4; // 11-3
    case 'afternoon': return 3; // 3-6
    case 'sameday': return 2;
    default: return 2;
  }
}

function getWindowLabel(window) {
  switch (window) {
    case 'morning': return '7AM-11AM';
    case 'midday': return '11AM-3PM';
    case 'afternoon': return '3PM-6PM';
    case 'sameday': return 'Same-Day';
    default: return window || '';
  }
}

function formatHour(h) {
  if (h === 0 || h === 12) return h === 0 ? '12 AM' : '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const { state } = useApp();
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const ws = getWeekStart(today);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [weekOffset]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    if (weekStart.getMonth() === end.getMonth()) {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} - ${end.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} - ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekStart]);

  // Map bookings to their day columns
  const bookingsByDay = useMemo(() => {
    const result = weekDays.map(() => []);
    (state.bookings || []).forEach((b) => {
      if (!b.deliveryDate) return;
      const bDate = new Date(b.deliveryDate + 'T00:00:00');
      weekDays.forEach((wd, idx) => {
        if (isSameDay(bDate, wd)) {
          result[idx].push(b);
        }
      });
    });
    return result;
  }, [state.bookings, weekDays]);

  const screenWidth = Dimensions.get('window').width;
  const timeGutterWidth = 52;
  const dayWidth = (screenWidth - timeGutterWidth - 32) / 7;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekOffset(0)} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
      </View>

      {/* Day Headers */}
      <View style={styles.dayHeaderRow}>
        <View style={{ width: timeGutterWidth }} />
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <View key={i} style={[styles.dayHeader, { width: dayWidth }]}>
              <Text style={[styles.dayHeaderLabel, isToday && styles.dayHeaderLabelToday]}>
                {DAY_LABELS[i]}
              </Text>
              <View style={[styles.dayHeaderNumber, isToday && styles.dayHeaderNumberToday]}>
                <Text style={[styles.dayHeaderDate, isToday && styles.dayHeaderDateToday]}>
                  {d.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Calendar Grid */}
      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridContent}>
        <View style={styles.grid}>
          {/* Time Gutter */}
          <View style={[styles.timeGutter, { width: timeGutterWidth }]}>
            {HOURS.map((h) => (
              <View key={h} style={[styles.hourCell, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{formatHour(h)}</Text>
              </View>
            ))}
          </View>

          {/* Day Columns */}
          {weekDays.map((d, dayIdx) => {
            const isToday = isSameDay(d, today);
            return (
              <View key={dayIdx} style={[styles.dayColumn, { width: dayWidth }, isToday && styles.dayColumnToday]}>
                {/* Hour grid lines */}
                {HOURS.map((h) => (
                  <View key={h} style={[styles.hourGridCell, { height: HOUR_HEIGHT }]} />
                ))}

                {/* Booking blocks */}
                {bookingsByDay[dayIdx].map((booking) => {
                  const startHour = getWindowHour(booking.deliveryWindow);
                  const duration = getWindowDuration(booking.deliveryWindow);
                  const topOffset = (startHour - HOURS[0]) * HOUR_HEIGHT;
                  const blockHeight = duration * HOUR_HEIGHT - 4;
                  const bgColor = STATUS_COLORS[booking.status] || colors.info;

                  return (
                    <TouchableOpacity
                      key={booking.id}
                      style={[
                        styles.bookingBlock,
                        {
                          top: topOffset + 2,
                          height: blockHeight,
                          backgroundColor: bgColor + '33',
                          borderLeftColor: bgColor,
                        },
                      ]}
                      onPress={() => router.push(`/booking/${booking.id}`)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.bookingBlockTime, { color: bgColor }]} numberOfLines={1}>
                        {getWindowLabel(booking.deliveryWindow)}
                      </Text>
                      <Text style={styles.bookingBlockName} numberOfLines={1}>
                        {booking.customerName}
                      </Text>
                      <Text style={styles.bookingBlockSize} numberOfLines={1}>
                        {booking.dumpsterSize}
                      </Text>
                      {booking.assignedDumpster && (
                        <Text style={styles.bookingBlockDumpster} numberOfLines={1}>
                          {booking.assignedDumpster}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>

        {/* Current time indicator */}
        {weekOffset === 0 && (() => {
          const now = new Date();
          const h = now.getHours();
          const m = now.getMinutes();
          if (h < HOURS[0] || h > HOURS[HOURS.length - 1]) return null;
          const topPos = (h - HOURS[0]) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
          const todayIdx = weekDays.findIndex(d => isSameDay(d, today));
          if (todayIdx < 0) return null;
          return (
            <View style={[styles.nowLine, { top: topPos, left: timeGutterWidth + todayIdx * dayWidth - 4 }]} pointerEvents="none">
              <View style={styles.nowDot} />
              <View style={[styles.nowLineBar, { width: dayWidth + 4 }]} />
            </View>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  navBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.bgCard,
  },
  todayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.primary,
    marginHorizontal: 12,
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  weekLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Day Headers
  dayHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  dayHeader: {
    alignItems: 'center',
  },
  dayHeaderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dayHeaderLabelToday: {
    color: colors.primary,
  },
  dayHeaderNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderNumberToday: {
    backgroundColor: colors.primary,
  },
  dayHeaderDate: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dayHeaderDateToday: {
    color: '#FFFFFF',
  },

  // Grid
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: 16,
    position: 'relative',
  },
  grid: {
    flexDirection: 'row',
    position: 'relative',
  },

  // Time Gutter
  timeGutter: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  hourCell: {
    justifyContent: 'flex-start',
    paddingRight: 8,
  },
  hourLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: -6,
  },

  // Day Columns
  dayColumn: {
    borderRightWidth: 0.5,
    borderRightColor: colors.border + '40',
    position: 'relative',
  },
  dayColumnToday: {
    backgroundColor: colors.primary + '08',
  },
  hourGridCell: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border + '60',
  },

  // Booking Blocks
  bookingBlock: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingHorizontal: 4,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  bookingBlockTime: {
    fontSize: 9,
    fontWeight: '700',
  },
  bookingBlockName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  bookingBlockSize: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
  },
  bookingBlockDumpster: {
    fontSize: 9,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // Now indicator
  nowLine: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  nowLineBar: {
    height: 2,
    backgroundColor: colors.danger,
  },
});
