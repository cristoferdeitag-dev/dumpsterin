import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { fetchGoogleCalendarEvents } from '../../src/lib/googleCalendar';

// On desktop web (>= 900px) we render the pixel-perfect Stitch port that uses
// HTML/Tailwind directly. Mobile and native keep the RN implementation below.
const WebSchedule = Platform.OS === 'web' ? require('../../src/screens/WebSchedule').default : null;

const C = {
  surface: '#FFFFFF',
  surface_low: '#F9F9F9',
  surface_lower: '#F3F3F3',
  surface_high: '#E8E8E8',
  border: 'rgba(221,193,174,0.25)',
  primary: '#FF8C00',
  primary_soft: '#FFE5C9',
  on_primary: '#FFFFFF',
  on_surface: '#1A1C1C',
  on_surface_variant: '#564334',
  // Event types
  delivery: '#1976D2',
  delivery_bg: 'rgba(25,118,210,0.15)',
  pickup: '#FF8C00',
  pickup_bg: 'rgba(255,140,0,0.15)',
  swap: '#7B1FA2',
  swap_bg: 'rgba(123,31,162,0.15)',
  maintenance: '#D32F2F',
  maintenance_bg: 'rgba(211,47,47,0.15)',
  red: '#D32F2F',
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM
const HOUR_LABELS = HOURS.map(h => {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
});

const HOUR_HEIGHT = 60;
const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const WINDOW_TO_HOUR = {
  '7-8': 7, '8-9': 8, '9-10': 9, '10-11': 10, '11-12': 11,
  '12-13': 12, '13-14': 13, '14-15': 14, '15-16': 15, '16-17': 16, '17-18': 17,
  morning: 8, midday: 11, afternoon: 14, sameday: 9,
};

function eventHourSlot(ev) {
  if (ev._isGoogle && ev._hour != null) return ev._hour;
  return WINDOW_TO_HOUR[ev.deliveryWindow];
}

const FILTERS = [
  { id: 'delivery', label: 'Deliveries', color: C.delivery, icon: 'cube-outline' },
  { id: 'pickup', label: 'Pickups', color: C.pickup, icon: 'arrow-up-circle-outline' },
  { id: 'swap', label: 'Swaps', color: C.swap, icon: 'swap-horizontal-outline' },
  { id: 'maintenance', label: 'Maintenance', color: C.maintenance, icon: 'construct-outline' },
];

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function eventTypeFor(booking) {
  if (booking._eventType === 'pickup') return 'pickup';
  if (booking._eventType === 'swap') return 'swap';
  if (booking._eventType === 'maintenance') return 'maintenance';
  return 'delivery';
}

function eventColors(type) {
  if (type === 'pickup') return { fg: C.pickup, bg: C.pickup_bg };
  if (type === 'swap') return { fg: C.swap, bg: C.swap_bg };
  if (type === 'maintenance') return { fg: C.maintenance, bg: C.maintenance_bg };
  return { fg: C.delivery, bg: C.delivery_bg };
}

// ────────────────────────────────────────────────────────────
// Sidebar (desktop only)
// ────────────────────────────────────────────────────────────
function Sidebar({ currentDate, onDateSelect, filters, onToggleFilter, onCreate }) {
  const today = new Date();
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const daysInPrev = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();

  const cells = [];
  for (let i = offset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, muted: true, date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, daysInPrev - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false, date: new Date(currentDate.getFullYear(), currentDate.getMonth(), d) });
  }
  while (cells.length % 7 !== 0) {
    const next = cells.length - offset - daysInMonth + 1;
    cells.push({ day: next, muted: true, date: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, next) });
  }

  return (
    <View style={{ width: 260, backgroundColor: C.surface_lower, paddingVertical: 20, paddingHorizontal: 14, borderRightWidth: 1, borderRightColor: C.border }}>
      {/* Brand */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, paddingHorizontal: 4 }}>
        <View style={{ width: 32, height: 32, backgroundColor: C.primary, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cube" size={18} color="#FFF" />
        </View>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.on_surface, letterSpacing: -0.3 }}>Dumpsterin</Text>
      </View>

      {/* Create button */}
      <TouchableOpacity
        onPress={onCreate}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 14,
          borderRadius: 12, marginBottom: 24,
          shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Ionicons name="add" size={22} color={C.primary} />
        <Text style={{ fontWeight: '700', color: C.on_surface, fontSize: 14 }}>Create</Text>
      </TouchableOpacity>

      {/* Mini Calendar */}
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.on_surface }}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            <TouchableOpacity onPress={() => onDateSelect(addDays(currentDate, -30))} style={{ padding: 4 }}>
              <Ionicons name="chevron-back" size={14} color={C.on_surface_variant} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDateSelect(addDays(currentDate, 30))} style={{ padding: 4 }}>
              <Ionicons name="chevron-forward" size={14} color={C.on_surface_variant} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.on_surface_variant }}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((c, i) => {
            const isToday = isSameDay(c.date, today);
            const isSelected = isSameDay(c.date, currentDate);
            return (
              <TouchableOpacity
                key={i}
                onPress={() => onDateSelect(c.date)}
                style={{
                  width: `${100/7}%`, height: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 2,
                }}
              >
                <View style={{
                  width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isToday ? C.primary : (isSelected ? C.primary_soft : 'transparent'),
                }}>
                  <Text style={{
                    fontSize: 11,
                    fontWeight: isToday || isSelected ? '700' : '500',
                    color: isToday ? '#FFF' : (c.muted ? '#BBB' : C.on_surface),
                  }}>{c.day}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* My calendars */}
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.on_surface_variant, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, paddingHorizontal: 4 }}>
        My calendars
      </Text>
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f.id}
          onPress={() => onToggleFilter(f.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 }}
        >
          <View style={{
            width: 16, height: 16, borderRadius: 3,
            backgroundColor: filters[f.id] ? f.color : 'transparent',
            borderWidth: 2, borderColor: f.color,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {filters[f.id] && <Ionicons name="checkmark" size={12} color="#FFF" />}
          </View>
          <Text style={{ fontSize: 13, color: C.on_surface, fontWeight: '500' }}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Top Toolbar
// ────────────────────────────────────────────────────────────
function Toolbar({ title, view, onSetView, onPrev, onNext, onToday, onCreate, isWide }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.on_surface, letterSpacing: -0.5 }} numberOfLines={1}>
          {title}
        </Text>
        {isWide && (
          <>
            <TouchableOpacity onPress={onToday} style={{ paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: C.border, borderRadius: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.on_surface }}>Today</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={onPrev} style={{ padding: 6 }}>
                <Ionicons name="chevron-back" size={20} color={C.on_surface} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onNext} style={{ padding: 6 }}>
                <Ionicons name="chevron-forward" size={20} color={C.on_surface} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {!isWide && (
          <>
            <TouchableOpacity onPress={onPrev} style={{ padding: 6 }}>
              <Ionicons name="chevron-back" size={20} color={C.on_surface} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onToday} style={{ paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border, borderRadius: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.on_surface }}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} style={{ padding: 6 }}>
              <Ionicons name="chevron-forward" size={20} color={C.on_surface} />
            </TouchableOpacity>
          </>
        )}

        {/* View switcher */}
        <View style={{ flexDirection: 'row', backgroundColor: C.surface_high, borderRadius: 10, padding: 3 }}>
          {(isWide ? ['day', 'week', 'month', 'agenda'] : ['day', 'week', 'month']).map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => onSetView(v)}
              style={{
                paddingHorizontal: isWide ? 14 : 10, paddingVertical: 6, borderRadius: 7,
                backgroundColor: view === v ? C.surface : 'transparent',
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: view === v ? '700' : '500',
                color: view === v ? C.primary : C.on_surface_variant,
                textTransform: 'capitalize',
              }}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isWide && (
          <TouchableOpacity
            onPress={onCreate}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Create</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Week View
// ────────────────────────────────────────────────────────────
function WeekView({ currentDate, events, onEventPress, isWide }) {
  const today = new Date();
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // No more horizontal scroll on mobile — each day takes 1/7th of the width
  // (cramped but full-week visible, and vertical scroll works).
  const colWidth = null;
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNowTick(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const eventsByDay = useMemo(() => {
    const map = {};
    days.forEach((_, i) => { map[i] = []; });
    events.forEach(ev => {
      days.forEach((d, i) => {
        if (isSameDay(ev._date, d)) map[i].push(ev);
      });
    });
    return map;
  }, [events, days[0].getTime()]);

  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const showNowLine = days.some(d => isSameDay(d, today));
  const nowTop = ((nowMinutes - HOURS[0] * 60) / 60) * HOUR_HEIGHT;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      {/* Day headers */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingLeft: 60 }}>
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <View key={i} style={{ width: colWidth || undefined, flex: colWidth ? undefined : 1, alignItems: 'center', paddingVertical: 12, backgroundColor: isToday ? 'rgba(255,140,0,0.04)' : 'transparent' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: isToday ? C.primary : C.on_surface_variant, letterSpacing: 1, textTransform: 'uppercase' }}>
                {DAY_NAMES_MON[i]}
              </Text>
              <View style={{
                width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4,
                backgroundColor: isToday ? C.primary : 'transparent',
              }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: isToday ? '#FFF' : C.on_surface }}>
                  {String(d.getDate()).padStart(2, '0')}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', position: 'relative' }}>
          {/* Time gutter */}
          <View style={{ width: 60, borderRightWidth: 1, borderRightColor: C.border }}>
            {HOURS.map((h, i) => (
              <View key={h} style={{ height: HOUR_HEIGHT, alignItems: 'flex-end', paddingRight: 8, paddingTop: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: C.on_surface_variant }}>{HOUR_LABELS[i]}</Text>
              </View>
            ))}
          </View>

          {/* Day columns */}
          <View style={{ flexDirection: 'row', flex: isWide ? 1 : undefined }}>
            {days.map((d, dayIdx) => {
              const isToday = isSameDay(d, today);
              const dayEvents = eventsByDay[dayIdx] || [];
              // Split timed (real hour or delivery_window) vs untimed.
              // Google Calendar events have a real start time → always timed.
              // Supabase bookings without delivery_window fall to "All-day".
              const timed = dayEvents.filter(ev => eventHourSlot(ev) != null);
              const untimed = dayEvents.filter(ev => eventHourSlot(ev) == null);
              return (
                <View key={dayIdx} style={{
                  width: colWidth || undefined,
                  flex: colWidth ? undefined : 1,
                  borderRightWidth: 1, borderRightColor: C.border,
                  backgroundColor: isToday ? 'rgba(255,140,0,0.03)' : 'transparent',
                  position: 'relative',
                }}>
                  {/* All-day pills band — empty if all events have real hours */}
                  {untimed.length > 0 && (
                    <View style={{ padding: 4, gap: 3, borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 30 }}>
                      {untimed.slice(0, 3).map((ev, idx) => {
                        const colors = eventColors(eventTypeFor(ev));
                        return (
                          <TouchableOpacity
                            key={`untimed-${ev.id}-${ev._eventType}-${idx}`}
                            onPress={() => onEventPress(ev)}
                            style={{
                              backgroundColor: colors.bg,
                              borderLeftWidth: 3, borderLeftColor: colors.fg,
                              borderRadius: 4,
                              paddingHorizontal: 5, paddingVertical: 2,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '600', color: C.on_surface }} numberOfLines={1}>
                              {ev.customerName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {untimed.length > 3 && (
                        <Text style={{ fontSize: 9, color: C.on_surface_variant, fontWeight: '600', paddingLeft: 4 }}>
                          +{untimed.length - 3} more
                        </Text>
                      )}
                    </View>
                  )}
                  {/* Hour grid lines */}
                  {HOURS.map(h => (
                    <View key={h} style={{ height: HOUR_HEIGHT, borderBottomWidth: 1, borderBottomColor: C.border }} />
                  ))}
                  {/* Timed events — group by hour for side-by-side layout */}
                  {(() => {
                    const byHour = {};
                    timed.forEach(ev => {
                      const h = eventHourSlot(ev);
                      (byHour[h] = byHour[h] || []).push(ev);
                    });
                    // The all-day band pushes the timed grid down. Compute its
                    // height so events line up with the hour gridlines.
                    const allDayHeight = untimed.length > 0
                      ? 30 + Math.min(untimed.length, 3) * 18 + (untimed.length > 3 ? 14 : 0)
                      : 0;
                    return Object.entries(byHour).flatMap(([hour, evs]) =>
                      evs.map((ev, eIdx) => {
                        const minute = ev._isGoogle && ev._minute != null ? ev._minute : 0;
                        const top = allDayHeight + (Number(hour) - HOURS[0]) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
                        const colors = eventColors(eventTypeFor(ev));
                        const label = ev._eventType === 'pickup' ? 'Pickup' :
                                      ev._eventType === 'swap' ? 'Swap' :
                                      ev._eventType === 'maintenance' ? 'Maint.' : 'Delivery';
                        const widthPct = 100 / evs.length;
                        const leftPct = widthPct * eIdx;
                        return (
                          <TouchableOpacity
                            key={`${ev.id}-${ev._eventType}-${eIdx}`}
                            onPress={() => onEventPress(ev)}
                            style={{
                              position: 'absolute',
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: top + 2, height: HOUR_HEIGHT - 4,
                              backgroundColor: colors.bg,
                              borderLeftWidth: 3, borderLeftColor: colors.fg,
                              borderRadius: 6,
                              padding: 5,
                              overflow: 'hidden',
                            }}
                          >
                            <Text style={{ fontSize: 9, fontWeight: '800', color: colors.fg, textTransform: 'uppercase', letterSpacing: 0.3 }} numberOfLines={1}>
                              {label}{ev.dumpsterSize ? ` · ${ev.dumpsterSize}` : ''}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: C.on_surface, marginTop: 1 }} numberOfLines={1}>
                              {ev.customerName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    );
                  })()}
                </View>
              );
            })}
          </View>

          {/* Now line */}
          {showNowLine && nowTop >= 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
            <View style={{ position: 'absolute', left: 60, right: 0, top: nowTop, height: 2, backgroundColor: C.red, zIndex: 50, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.red, marginLeft: -5 }} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Day View (single column, big)
// ────────────────────────────────────────────────────────────
function DayView({ currentDate, events, onEventPress }) {
  const today = new Date();
  const dayEvents = events.filter(ev => isSameDay(ev._date, currentDate));
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const isCurrentDay = isSameDay(currentDate, today);
  const nowTop = ((nowMinutes - HOURS[0] * 60) / 60) * HOUR_HEIGHT;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={{ alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: isCurrentDay ? C.primary : C.on_surface_variant, letterSpacing: 1, textTransform: 'uppercase' }}>
          {DAY_NAMES_FULL[currentDate.getDay()]}
        </Text>
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4,
          backgroundColor: isCurrentDay ? C.primary : 'transparent',
        }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: isCurrentDay ? '#FFF' : C.on_surface }}>
            {currentDate.getDate()}
          </Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', position: 'relative' }}>
          <View style={{ width: 60, borderRightWidth: 1, borderRightColor: C.border }}>
            {HOURS.map((h, i) => (
              <View key={h} style={{ height: HOUR_HEIGHT, alignItems: 'flex-end', paddingRight: 8, paddingTop: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: C.on_surface_variant }}>{HOUR_LABELS[i]}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, position: 'relative' }}>
            {HOURS.map(h => (
              <View key={h} style={{ height: HOUR_HEIGHT, borderBottomWidth: 1, borderBottomColor: C.border }} />
            ))}
            {dayEvents.map((ev, i) => {
              const hour = WINDOW_TO_HOUR[ev.deliveryWindow] || 8;
              const top = (hour - HOURS[0]) * HOUR_HEIGHT;
              const colors = eventColors(eventTypeFor(ev));
              const label = ev._eventType === 'pickup' ? 'Pickup' :
                            ev._eventType === 'swap' ? 'Swap' :
                            ev._eventType === 'maintenance' ? 'Maintenance' : 'Delivery';
              return (
                <TouchableOpacity
                  key={`${ev.id}-${i}`}
                  onPress={() => onEventPress(ev)}
                  style={{
                    position: 'absolute',
                    left: 10, right: 10,
                    top: top + 2, height: HOUR_HEIGHT - 4,
                    backgroundColor: colors.bg,
                    borderLeftWidth: 4, borderLeftColor: colors.fg,
                    borderRadius: 8, padding: 10,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.fg, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label} {ev.dumpsterSize ? `· ${ev.dumpsterSize}` : ''}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.on_surface, marginTop: 2 }}>
                    {ev.customerName}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {isCurrentDay && nowTop >= 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
              <View style={{ position: 'absolute', left: 0, right: 0, top: nowTop, height: 2, backgroundColor: C.red, zIndex: 50, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.red, marginLeft: -5 }} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Month View
// ────────────────────────────────────────────────────────────
function MonthView({ currentDate, events, onEventPress, onDateSelect }) {
  const today = new Date();
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const gridStart = addDays(monthStart, -offset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      const key = `${ev._date.getFullYear()}-${ev._date.getMonth()}-${ev._date.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border }}>
        {DAY_NAMES_MON.map(d => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.on_surface_variant, letterSpacing: 1, textTransform: 'uppercase' }}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isThisMonth = d.getMonth() === currentDate.getMonth();
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayEvents = eventsByDate[key] || [];
          return (
            <TouchableOpacity
              key={i}
              onPress={() => onDateSelect(d)}
              style={{
                width: `${100/7}%`, height: '16.66%',
                borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.border,
                padding: 6,
                backgroundColor: isToday ? 'rgba(255,140,0,0.04)' : (isThisMonth ? C.surface : C.surface_lower),
              }}
            >
              <View style={{ alignItems: 'flex-end', marginBottom: 4 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isToday ? C.primary : 'transparent',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: isToday ? '800' : '500', color: isToday ? '#FFF' : (isThisMonth ? C.on_surface : '#BBB') }}>
                    {d.getDate()}
                  </Text>
                </View>
              </View>
              {dayEvents.slice(0, 3).map((ev, idx) => {
                const colors = eventColors(eventTypeFor(ev));
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => onEventPress(ev)}
                    style={{
                      backgroundColor: colors.bg,
                      borderLeftWidth: 2, borderLeftColor: colors.fg,
                      paddingHorizontal: 4, paddingVertical: 2,
                      borderRadius: 3, marginBottom: 2,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '600', color: C.on_surface }} numberOfLines={1}>
                      {ev.customerName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {dayEvents.length > 3 && (
                <Text style={{ fontSize: 9, color: C.on_surface_variant, fontWeight: '600', marginTop: 1 }}>
                  +{dayEvents.length - 3} more
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Agenda View
// ────────────────────────────────────────────────────────────
function AgendaView({ currentDate, events, onEventPress }) {
  const today = new Date();
  // Show next 30 days from currentDate
  const rangeStart = new Date(currentDate);
  rangeStart.setHours(0, 0, 0, 0);
  const sorted = events
    .filter(ev => ev._date >= rangeStart)
    .sort((a, b) => a._date - b._date)
    .slice(0, 100);

  const grouped = [];
  let lastKey = null;
  sorted.forEach(ev => {
    const key = `${ev._date.getFullYear()}-${ev._date.getMonth()}-${ev._date.getDate()}`;
    if (key !== lastKey) {
      grouped.push({ type: 'header', date: ev._date });
      lastKey = key;
    }
    grouped.push({ type: 'event', event: ev });
  });

  if (grouped.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="calendar-clear-outline" size={48} color={C.on_surface_variant} />
        <Text style={{ marginTop: 12, color: C.on_surface_variant, fontSize: 14 }}>No upcoming events</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.surface }} contentContainerStyle={{ padding: 20 }}>
      {grouped.map((item, i) => {
        if (item.type === 'header') {
          const isToday = isSameDay(item.date, today);
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: i === 0 ? 0 : 24, marginBottom: 10 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? C.primary : C.surface_high,
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: isToday ? '#FFF' : C.on_surface }}>
                  {item.date.getDate()}
                </Text>
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.on_surface }}>
                  {DAY_NAMES_FULL[item.date.getDay()]}, {MONTHS[item.date.getMonth()]} {item.date.getDate()}
                </Text>
                <Text style={{ fontSize: 11, color: C.on_surface_variant, marginTop: 1 }}>
                  {isToday ? 'Today' : ''}
                </Text>
              </View>
            </View>
          );
        }
        const ev = item.event;
        const colors = eventColors(eventTypeFor(ev));
        const label = ev._eventType === 'pickup' ? 'Pickup' :
                      ev._eventType === 'swap' ? 'Swap' :
                      ev._eventType === 'maintenance' ? 'Maintenance' : 'Delivery';
        const hour = WINDOW_TO_HOUR[ev.deliveryWindow];
        const timeLabel = hour ? HOUR_LABELS[hour - HOURS[0]] : '';
        return (
          <TouchableOpacity
            key={i}
            onPress={() => onEventPress(ev)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: C.surface_low, borderRadius: 10, padding: 12, marginBottom: 6, marginLeft: 52,
              borderLeftWidth: 3, borderLeftColor: colors.fg,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.fg, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label} {ev.dumpsterSize ? `· ${ev.dumpsterSize}` : ''}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.on_surface, marginTop: 2 }}>
                {ev.customerName}
              </Text>
              {ev.deliveryAddress ? (
                <Text style={{ fontSize: 12, color: C.on_surface_variant, marginTop: 2 }} numberOfLines={1}>
                  {ev.deliveryAddress}
                </Text>
              ) : null}
            </View>
            {timeLabel ? (
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.on_surface_variant }}>{timeLabel}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ────────────────────────────────────────────────────────────
// Main Screen
// ────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const { state } = useApp();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  // Default to 'day' on mobile (one wide column, no cramped 7-col grid);
  // 'week' on desktop where there's room.
  const [view, setView] = useState(() => {
    const w = Dimensions.get('window').width;
    return w >= 900 ? 'week' : 'day';
  });
  const [filters, setFilters] = useState({ delivery: true, pickup: true, swap: true, maintenance: true });
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const [googleEvents, setGoogleEvents] = useState([]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWindowWidth(window.width));
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const from = new Date(currentDate);
      from.setDate(from.getDate() - 14);
      const to = new Date(currentDate);
      to.setDate(to.getDate() + 28);
      const evs = await fetchGoogleCalendarEvents(
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
      );
      if (!cancelled) setGoogleEvents(evs);
    }
    load();
    return () => { cancelled = true; };
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  const isWide = windowWidth >= 900;

  // On desktop web, hand off to the HTML/Tailwind port that mirrors the
  // Stitch design exactly. Mobile/web-narrow stays on RN.
  if (Platform.OS === 'web' && isWide && WebSchedule) {
    return <WebSchedule />;
  }

  // Build events list — Google Calendar events have real hours, Supabase
  // bookings fill in the rest.
  const events = useMemo(() => {
    const out = [];
    googleEvents.forEach(ev => out.push(ev));
    state.bookings.forEach(b => {
      if (b.deliveryDate) {
        const d = new Date(b.deliveryDate + 'T12:00:00');
        out.push({ ...b, _eventType: 'delivery', _date: d });
      }
      if (b.pickupDate) {
        const d = new Date(b.pickupDate + 'T12:00:00');
        out.push({ ...b, _eventType: 'pickup', _date: d, deliveryWindow: b.pickupWindow || 'morning' });
      }
    });
    return out.filter(ev => filters[ev._eventType]);
  }, [state.bookings, googleEvents, filters]);

  const goPrev = () => {
    const step = view === 'day' ? -1 : view === 'week' ? -7 : view === 'month' ? -30 : -7;
    setCurrentDate(addDays(currentDate, step));
  };
  const goNext = () => {
    const step = view === 'day' ? 1 : view === 'week' ? 7 : view === 'month' ? 30 : 7;
    setCurrentDate(addDays(currentDate, step));
  };
  const goToday = () => setCurrentDate(new Date());

  const title = useMemo(() => {
    if (view === 'day') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
    if (view === 'week') {
      const ws = startOfWeek(currentDate);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth()) {
        return `${MONTHS[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`;
      }
      return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [view, currentDate]);

  const handleEventPress = (ev) => {
    if (ev._isGoogle) {
      const link = ev._googleEvent?.htmlLink;
      if (link) Linking.openURL(link);
      return;
    }
    router.push(`/booking/${ev.id}`);
  };
  const handleCreate = () => router.push('/booking/create');
  const toggleFilter = (id) => setFilters(f => ({ ...f, [id]: !f[id] }));

  return (
    <View style={{ flex: 1, backgroundColor: C.surface_low, flexDirection: 'row' }}>
      {isWide && (
        <Sidebar
          currentDate={currentDate}
          onDateSelect={setCurrentDate}
          filters={filters}
          onToggleFilter={toggleFilter}
          onCreate={handleCreate}
        />
      )}
      <View style={{ flex: 1 }}>
        <Toolbar
          title={title}
          view={view}
          onSetView={setView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onCreate={handleCreate}
          isWide={isWide}
        />
        <View style={{ flex: 1, backgroundColor: C.surface }}>
          {view === 'week' && <WeekView currentDate={currentDate} events={events} onEventPress={handleEventPress} isWide={isWide} />}
          {view === 'day' && <DayView currentDate={currentDate} events={events} onEventPress={handleEventPress} />}
          {view === 'month' && <MonthView currentDate={currentDate} events={events} onEventPress={handleEventPress} onDateSelect={(d) => { setCurrentDate(d); setView('day'); }} />}
          {view === 'agenda' && <AgendaView currentDate={currentDate} events={events} onEventPress={handleEventPress} />}
        </View>

        {!isWide && (
          <TouchableOpacity
            onPress={handleCreate}
            style={{
              position: 'absolute', bottom: 24, right: 24,
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: C.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Ionicons name="add" size={28} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
