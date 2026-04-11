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
  const COL_WIDTH = Math.floor((screenWidth - 32 - GUTTER_WIDTH) / 7);
  const HEADER_HEIGHT = 140; // header + nav + day headers
  const TAB_BAR_HEIGHT = 72;
  const availableHeight = screenHeight - HEADER_HEIGHT - TAB_BAR_HEIGHT - 40;
  const ROW_HEIGHT = Math.max(Math.floor(availableHeight / HOURS.length), 36);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 36, fontWeight: '800', color: COLORS.on_surface, letterSpacing: -0.5, marginBottom: 4 }}>
            {formatDateRange(weekDays)}
          </Text>
          <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 10, color: COLORS.on_surface_variant }}>
            FISCAL YEAR 2026 {'\u2022'} LOGISTICS QUEUE
          </Text>
        </View>

        {/* Navigation */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface_container_low, borderRadius: 12, padding: 6, marginBottom: 24, alignSelf: 'flex-start' }}>
          <TouchableOpacity
            onPress={() => setWeekOffset(weekOffset - 1)}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
          >
            <Text style={{ color: COLORS.on_surface, fontSize: 20 }}>{'<'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setWeekOffset(0)}
            style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.surface_container_highest, borderRadius: 8, marginHorizontal: 4 }}
          >
            <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 10, color: COLORS.primary }}>
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setWeekOffset(weekOffset + 1)}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
          >
            <Text style={{ color: COLORS.on_surface, fontSize: 20 }}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        {/* Summary Row */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1, backgroundColor: COLORS.surface_container_high, padding: 14, borderRadius: 12 }}>
            <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.on_surface_variant, marginBottom: 4 }}>
              Weekly Capacity
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.5 }}>
                {utilization}%
              </Text>
              <Text style={{ color: COLORS.secondary_container, fontSize: 11, marginBottom: 2 }}>
                Util.
              </Text>
            </View>
            <View style={{ height: 4, width: '100%', backgroundColor: COLORS.surface_container_lowest, borderRadius: 9999, overflow: 'hidden', marginTop: 6 }}>
              <View style={{ height: '100%', width: `${Math.min(utilization, 100)}%`, backgroundColor: COLORS.primary, borderRadius: 9999 }} />
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/booking/create')}
            style={{ flex: 1, backgroundColor: COLORS.surface_container_low, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,183,125,0.2)', justifyContent: 'center' }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.primary, marginBottom: 2 }}>
                  Quick Action
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.on_surface, letterSpacing: -0.5 }}>
                  New Booking
                </Text>
              </View>
              <Text style={{ fontSize: 24, color: COLORS.primary }}>+</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Calendar Grid */}
        <View style={{ backgroundColor: COLORS.surface_container_low, borderRadius: 16, overflow: 'hidden' }}>
            <View>
              {/* Day Headers */}
              <View style={{ flexDirection: 'row', backgroundColor: COLORS.surface_container_high }}>
                <View style={{ width: GUTTER_WIDTH, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                  <Text style={{ color: COLORS.secondary_container, fontSize: 16 }}>{'\u23F1'}</Text>
                </View>
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

              {/* Time Rows */}
              {HOURS.map((slot) => (
                <View key={slot.hour} style={{ flexDirection: 'row', minHeight: ROW_HEIGHT }}>
                  {/* Time Gutter */}
                  <View style={{ width: GUTTER_WIDTH, justifyContent: 'flex-start', paddingTop: 12, paddingRight: 8, alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', fontSize: 9, color: COLORS.secondary_container }}>
                      {slot.label}
                    </Text>
                  </View>
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
                              <Text style={{
                                fontSize: 9,
                                fontWeight: '700',
                                color: blockColor,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                marginBottom: 2,
                              }}>
                                {isPickup ? 'PICKUP' : (booking.status === 'in_transit' ? 'In Transit' : booking.status)}
                              </Text>
                              <Text style={{ fontWeight: '700', fontSize: 12, color: COLORS.on_surface }} numberOfLines={1}>
                                {booking.customerName}
                              </Text>
                              <Text style={{ fontSize: 10, color: COLORS.on_surface_variant, marginTop: 2 }} numberOfLines={1}>
                                {booking.dumpsterSize} {isPickup ? 'Pickup' : 'Delivery'}
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
        </View>

      </ScrollView>
    </View>
  );
}
