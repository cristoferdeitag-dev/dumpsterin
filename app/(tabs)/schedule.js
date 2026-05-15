import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';

const COLORS = {
  surface: '#FFFFFF',
  surface_container_low: '#F7F7F7',
  surface_container: '#F2F2F2',
  surface_container_high: '#EEEEEE',
  surface_container_highest: '#E8E8E8',
  surface_container_lowest: '#F0F0F0',
  surface_bright: '#E0E0E0',
  primary: '#ffb77d',
  primary_container: '#ff8c00',
  on_primary: '#4d2600',
  on_surface: '#1A1A1A',
  on_surface_variant: '#666666',
  tertiary: '#85cfff',
  error: '#ffb4ab',
  outline_variant: '#E0E0E0',
  secondary_container: '#D0D0D0',
};

const HOURS = [
  { label: '07 AM', hour: 7 },
  { label: '08 AM', hour: 8 },
  { label: '09 AM', hour: 9 },
  { label: '10 AM', hour: 10 },
  { label: '11 AM', hour: 11 },
  { label: '12 PM', hour: 12 },
  { label: '01 PM', hour: 13 },
  { label: '02 PM', hour: 14 },
  { label: '03 PM', hour: 15 },
  { label: '04 PM', hour: 16 },
  { label: '05 PM', hour: 17 },
  { label: '06 PM', hour: 18 },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const WINDOW_TO_HOUR = {
  '7-8': 7, '8-9': 8, '9-10': 9, '10-11': 10, '11-12': 11,
  '12-13': 12, '13-14': 13, '14-15': 14, '15-16': 15, '16-17': 16, '17-18': 17,
  // Legacy mappings
  morning: 7, midday: 11, afternoon: 15, sameday: 9,
};

function getWeekDays(offset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDateRange(days) {
  const first = days[0];
  const last = days[6];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  if (first.getMonth() === last.getMonth()) {
    return `${months[first.getMonth()]} ${first.getDate()}\u2014${last.getDate()}`;
  }
  return `${months[first.getMonth()]} ${first.getDate()}\u2014${months[last.getMonth()]} ${last.getDate()}`;
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function getStatusColor(status) {
  const colors = {
    scheduled: COLORS.primary, in_transit: COLORS.tertiary,
    on_site: '#00C853', ready_for_pickup: '#00b5fc',
    picked_up: '#85cfff', dumping: '#FF8C00',
    completed: '#999999', cancelled: '#ffb4ab',
  };
  return colors[status] || COLORS.primary;
}

export default function ScheduleScreen() {
  const { state } = useApp();
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = new Date();

  const bookingsByDay = useMemo(() => {
    const map = {};
    weekDays.forEach((day, idx) => {
      map[idx] = [];
    });
    state.bookings.forEach((booking) => {
      // Add delivery event
      if (booking.deliveryDate) {
        const bDate = new Date(booking.deliveryDate + 'T12:00:00');
        weekDays.forEach((day, idx) => {
          if (isSameDay(bDate, day)) {
            map[idx].push({ ...booking, _eventType: 'delivery' });
          }
        });
      }
      // Add pickup event (separate entry)
      if (booking.pickupDate) {
        const pDate = new Date(booking.pickupDate + 'T12:00:00');
        weekDays.forEach((day, idx) => {
          if (isSameDay(pDate, day)) {
            map[idx].push({ ...booking, _eventType: 'pickup', deliveryWindow: 'morning' });
          }
        });
      }
    });
    return map;
  }, [state.bookings, weekDays]);

  const totalSlots = 7 * HOURS.length;
  const filledSlots = Object.values(bookingsByDay).reduce((sum, arr) => sum + arr.length, 0);
  const utilization = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const GUTTER_WIDTH = 44;
  // Fixed column width so each day cell is wide enough for readable text.
  // On phones (~360-400px) this gives ~3-4 visible days; users swipe horizontally
  // to see the rest of the week. Mirrors Google Calendar mobile UX.
  const COL_WIDTH = 96;
  const HEADER_HEIGHT = 140; // header + nav + day headers
  const TAB_BAR_HEIGHT = 72;
  const availableHeight = screenHeight - HEADER_HEIGHT - TAB_BAR_HEIGHT - 40;
  const ROW_HEIGHT = Math.max(Math.floor(availableHeight / HOURS.length), 36);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      {/* Compact header bar — date range + week nav + new booking button on one
          row so the calendar grid has the most vertical space possible (per
          Asaí 2026-04-30: "se sigue viendo vacío" because heavy header pushed
          calendar off-screen). */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity onPress={() => setWeekOffset(weekOffset - 1)} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: COLORS.surface_container_low }}>
          <Text style={{ color: COLORS.on_surface, fontSize: 18 }}>{'<'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setWeekOffset(0)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.on_surface }} numberOfLines={1}>
            {formatDateRange(weekDays)}
          </Text>
          {weekOffset !== 0 && (
            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              Tap for today
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setWeekOffset(weekOffset + 1)} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: COLORS.surface_container_low }}>
          <Text style={{ color: COLORS.on_surface, fontSize: 18 }}>{'>'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/booking/create')}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: COLORS.primary_container }}
        >
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 22 }}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>

        {/* Calendar Grid \u2014 horizontal scroll for day columns so each cell can
            be wide enough for readable text (96px). Time gutter stays fixed
            on the left so users always see the hour labels. */}
        <View style={{ backgroundColor: COLORS.surface_container_low, borderRadius: 16, overflow: 'hidden', flexDirection: 'row' }}>
          {/* Fixed time gutter on the left */}
          <View>
            {/* Header spacer to match day-header row height */}
            <View style={{ width: GUTTER_WIDTH, height: 56, backgroundColor: COLORS.surface_container_high, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.secondary_container, fontSize: 16 }}>{'\u23F1'}</Text>
            </View>
            {HOURS.map((slot) => (
              <View key={'gutter-' + slot.hour} style={{ width: GUTTER_WIDTH, minHeight: ROW_HEIGHT, justifyContent: 'flex-start', paddingTop: 12, paddingRight: 8, alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '600', letterSpacing: 1, fontSize: 9, color: COLORS.secondary_container }}>
                  {slot.label}
                </Text>
              </View>
            ))}
          </View>
          {/* Scrollable day columns */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            <View>
              {/* Day Headers */}
              <View style={{ flexDirection: 'row', backgroundColor: COLORS.surface_container_high, height: 56 }}>
                {weekDays.map((day, idx) => {
                  const isToday = isSameDay(day, today);
                  return (
                    <View
                      key={idx}
                      style={{
                        width: COL_WIDTH,
                        alignItems: 'center',
                        paddingVertical: 12,
                        backgroundColor: isToday ? 'rgba(255,183,125,0.1)' : 'transparent',
                      }}
                    >
                      <Text style={{
                        fontWeight: '600',
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        fontSize: 9,
                        color: isToday ? COLORS.primary : COLORS.secondary_container,
                        marginBottom: 2,
                      }}>
                        {DAY_NAMES[idx]}
                      </Text>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '800',
                        color: isToday ? COLORS.primary : COLORS.on_surface,
                        letterSpacing: -0.5,
                      }}>
                        {String(day.getDate()).padStart(2, '0')}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Time Rows — gutter is now rendered separately on the left */}
              {HOURS.map((slot) => (
                <View key={slot.hour} style={{ flexDirection: 'row', minHeight: ROW_HEIGHT }}>
                  {/* Day Columns */}
                  {weekDays.map((day, dayIdx) => {
                    const isToday = isSameDay(day, today);
                    const dayBookings = bookingsByDay[dayIdx]?.filter(
                      (b) => WINDOW_TO_HOUR[b.deliveryWindow] === slot.hour
                    ) || [];
                    return (
                      <View
                        key={dayIdx}
                        style={{
                          width: COL_WIDTH,
                          minHeight: ROW_HEIGHT,
                          padding: 4,
                          backgroundColor: isToday ? 'rgba(255,255,255,0.01)' : 'transparent',
                        }}
                      >
                        {dayBookings.map((booking, bIdx) => {
                          const isPickup = booking._eventType === 'pickup';
                          const blockColor = isPickup ? '#ff5252' : getStatusColor(booking.status);
                          const bgColor = isPickup ? 'rgba(255,82,82,0.1)' : (blockColor === COLORS.tertiary ? 'rgba(133,207,255,0.1)' : 'rgba(255,183,125,0.1)');
                          return (
                            <TouchableOpacity
                              key={booking.id + '-' + (isPickup ? 'p' : 'd') + bIdx}
                              onPress={() => router.push(`/booking/${booking.id}`)}
                              style={{
                                backgroundColor: bgColor,
                                borderLeftWidth: 3,
                                borderLeftColor: blockColor,
                                borderTopRightRadius: 8,
                                borderBottomRightRadius: 8,
                                padding: 8,
                                marginBottom: 4,
                              }}
                            >
                              {/* Compact card: dot + name + size on one line each.
                                  Avoids the letter-by-letter text break Asaí showed. */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: blockColor }} />
                                <Text style={{
                                  fontSize: 8,
                                  fontWeight: '700',
                                  color: blockColor,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.3,
                                }} numberOfLines={1}>
                                  {isPickup ? 'PICKUP' : (booking.status === 'in_transit' ? 'In transit' : (booking.status || '').replace('_', ' '))}
                                </Text>
                              </View>
                              <Text style={{ fontWeight: '700', fontSize: 11, color: COLORS.on_surface, lineHeight: 13 }} numberOfLines={1}>
                                {booking.customerName}
                              </Text>
                              <Text style={{ fontSize: 9, color: COLORS.on_surface_variant }} numberOfLines={1}>
                                {booking.dumpsterSize}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

      </ScrollView>
    </View>
  );
}
