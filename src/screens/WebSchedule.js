// Desktop-web Calendar — ports the Stitch HTML literally with Tailwind so
// the design stays pixel-perfect on dumpsterin.com. Only loaded when
// Platform.OS === 'web' AND window.innerWidth >= 900. Mobile falls back to
// the React Native version in schedule.js.

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { fetchGoogleCalendarEvents } from '../lib/googleCalendar';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM → 8 PM
const HOUR_LABELS = HOURS.map((h) => {
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
});
const HOUR_HEIGHT = 60;

const DAY_NAMES_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const WINDOW_TO_HOUR = {
  '7-8': 7, '8-9': 8, '9-10': 9, '10-11': 10, '11-12': 11,
  '12-13': 12, '13-14': 13, '14-15': 14, '15-16': 15, '16-17': 16, '17-18': 17,
  morning: 8, midday: 11, afternoon: 14, sameday: 9,
};

// Resolves the hour slot for an event. Google Calendar events use the real
// _hour from event.start. Supabase bookings fall back to delivery_window.
function eventHourSlot(ev) {
  if (ev._isGoogle && ev._hour != null) return ev._hour;
  return WINDOW_TO_HOUR[ev.deliveryWindow];
}

const FILTERS = [
  { id: 'delivery', label: 'Deliveries', tw: 'sky-600', hex: '#0284c7', bgHex: 'rgba(2,132,199,0.15)', icon: 'local_shipping' },
  { id: 'pickup',   label: 'Pickups',    tw: 'orange-500', hex: '#f97316', bgHex: 'rgba(249,115,22,0.15)', icon: 'move_to_inbox' },
  { id: 'swap',     label: 'Swaps',      tw: 'purple-600', hex: '#9333ea', bgHex: 'rgba(147,51,234,0.15)', icon: 'sync_alt' },
  { id: 'maintenance', label: 'Maintenance', tw: 'red-600', hex: '#dc2626', bgHex: 'rgba(220,38,38,0.15)', icon: 'build' },
];

const FILTER_BY_TYPE = Object.fromEntries(FILTERS.map((f) => [f.id, f]));

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function eventTypeFor(b) {
  if (b._eventType === 'pickup') return 'pickup';
  if (b._eventType === 'swap') return 'swap';
  if (b._eventType === 'maintenance') return 'maintenance';
  return 'delivery';
}

function MiniCalendar({ currentDate, onDateSelect }) {
  const today = new Date();
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const gridStart = addDays(monthStart, -offset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="px-1">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-gray-900">
          {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
        </span>
        <div className="flex gap-1">
          <button onClick={() => onDateSelect(addDays(currentDate, -30))} className="p-1 hover:bg-gray-200 rounded text-gray-600">‹</button>
          <button onClick={() => onDateSelect(addDays(currentDate, 30))} className="p-1 hover:bg-gray-200 rounded text-gray-600">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-gray-500 font-bold mb-2">
        <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {cells.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, currentDate);
          const muted = d.getMonth() !== currentDate.getMonth();
          let cls = 'p-1 rounded cursor-pointer ';
          if (isToday) cls += 'bg-orange-500 text-white font-bold rounded-full';
          else if (isSelected) cls += 'bg-orange-100 text-orange-700 font-bold rounded-full';
          else if (muted) cls += 'opacity-30 hover:bg-gray-200';
          else cls += 'hover:bg-gray-200 text-gray-800';
          return (
            <span key={i} className={cls} onClick={() => onDateSelect(d)}>
              {d.getDate()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Sidebar({ currentDate, onDateSelect, filters, toggleFilter, onCreate }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-72 bg-gray-50 border-r border-gray-200 py-6 px-4 flex flex-col z-40">
      <div className="flex items-center gap-3 mb-7 px-2">
        <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center shadow-md">
          <span className="material-symbols-outlined text-white text-xl">cube</span>
        </div>
        <span className="text-lg font-extrabold text-gray-900 tracking-tight">Dumpsterin</span>
      </div>

      <button
        onClick={onCreate}
        className="flex items-center gap-3 bg-white text-gray-900 px-5 py-3.5 rounded-2xl shadow-md hover:shadow-lg transition-all mb-7 active:scale-95 group"
      >
        <span className="material-symbols-outlined text-orange-500 font-bold">add</span>
        <span className="font-bold">Create</span>
      </button>

      <MiniCalendar currentDate={currentDate} onDateSelect={onDateSelect} />

      <div className="mt-7 border-t border-gray-200 pt-5">
        <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500 mb-3 px-2">My calendars</h3>
        <div className="space-y-1 px-2">
          {FILTERS.map((f) => (
            <label key={f.id} className="flex items-center gap-3 cursor-pointer py-1.5 group">
              <span
                onClick={() => toggleFilter(f.id)}
                className="w-4 h-4 rounded-sm flex items-center justify-center"
                style={{
                  backgroundColor: filters[f.id] ? f.hex : 'transparent',
                  border: `2px solid ${f.hex}`,
                }}
              >
                {filters[f.id] && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
              </span>
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{f.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-auto flex justify-between px-2 pt-4 border-t border-gray-200">
        <span className="material-symbols-outlined text-gray-500 cursor-pointer hover:text-orange-500 transition-colors">settings</span>
        <span className="material-symbols-outlined text-gray-500 cursor-pointer hover:text-orange-500 transition-colors">help</span>
      </div>
    </aside>
  );
}

function Toolbar({ title, view, setView, onPrev, onNext, onToday }) {
  return (
    <header className="flex justify-between items-center w-full px-8 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-gray-200">
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
        <button onClick={onToday} className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors">Today</button>
        <div className="flex items-center">
          <button onClick={onPrev} className="material-symbols-outlined text-xl text-gray-600 cursor-pointer hover:bg-gray-100 rounded p-1">chevron_left</button>
          <button onClick={onNext} className="material-symbols-outlined text-xl text-gray-600 cursor-pointer hover:bg-gray-100 rounded p-1">chevron_right</button>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {['day', 'week', 'month', 'agenda'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-all capitalize ${
                view === v
                  ? 'bg-white text-orange-500 font-bold shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 font-medium'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function WeekGrid({ currentDate, events, onEventClick }) {
  const today = new Date();
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNowTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const showNow = days.some((d) => isSameDay(d, today));
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const nowTop = ((nowMin - HOURS[0] * 60) / 60) * HOUR_HEIGHT;

  const eventsByDay = useMemo(() => {
    const map = days.map(() => []);
    events.forEach((ev) => {
      days.forEach((d, i) => {
        if (isSameDay(ev._date, d)) map[i].push(ev);
      });
    });
    return map;
  }, [events, days[0].getTime()]);

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {/* Day Header Row */}
      <div className="flex border-b border-gray-200" style={{ marginLeft: 60 }}>
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={i} className={`flex-1 py-3 text-center ${isToday ? 'bg-orange-50' : ''}`}>
              <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${isToday ? 'text-orange-500' : 'text-gray-500'}`}>
                {DAY_NAMES_MON[i]}
              </p>
              {isToday ? (
                <span className="inline-block w-10 h-10 leading-10 bg-orange-500 text-white rounded-full text-xl font-extrabold">
                  {String(d.getDate()).padStart(2, '0')}
                </span>
              ) : (
                <p className="text-xl font-extrabold text-gray-900">{String(d.getDate()).padStart(2, '0')}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable Grid Body */}
      <div className="flex-grow overflow-y-auto relative">
        {/* Time Column */}
        <div
          className="absolute left-0 top-0 w-[60px] h-full border-r border-gray-200 bg-white z-10"
          style={{ width: 60 }}
        >
          {HOUR_LABELS.map((label, i) => (
            <div
              key={i}
              style={{ height: HOUR_HEIGHT }}
              className="flex items-start justify-end pr-2 pt-1 text-[10px] font-bold text-gray-500"
            >
              {label}
            </div>
          ))}
        </div>

        {/* All-day band — events without a real hour. Google Calendar events
            with a real start time bypass this band entirely. */}
        <div className="flex border-b border-gray-200" style={{ marginLeft: 60 }}>
          <div
            className="absolute text-[10px] font-bold text-gray-500 px-2"
            style={{ left: 4, marginTop: 6, width: 56, textAlign: 'right' }}
          >
            All-day
          </div>
          {days.map((d, idx) => {
            const isToday = isSameDay(d, today);
            const untimed = (eventsByDay[idx] || []).filter((ev) => eventHourSlot(ev) == null);
            return (
              <div
                key={idx}
                className={`flex-1 px-1 py-1.5 border-r border-gray-200 ${isToday ? 'bg-orange-50/30' : ''}`}
                style={{ minHeight: 36 }}
              >
                {untimed.slice(0, 3).map((ev, i) => {
                  const colors = FILTER_BY_TYPE[eventTypeFor(ev)] || FILTER_BY_TYPE.delivery;
                  return (
                    <div
                      key={`ad-${ev.id}-${i}`}
                      onClick={() => onEventClick(ev)}
                      className="rounded-md cursor-pointer text-[10px] font-semibold text-gray-900 px-1.5 py-0.5 mb-0.5 truncate"
                      style={{ backgroundColor: colors.bgHex, borderLeft: `2px solid ${colors.hex}` }}
                    >
                      {ev.customerName}
                    </div>
                  );
                })}
                {untimed.length > 3 && (
                  <div className="text-[10px] text-gray-500 font-semibold pl-1">+{untimed.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex relative" style={{ marginLeft: 60, minHeight: HOURS.length * HOUR_HEIGHT }}>
          {/* Column dividers with hour gridlines */}
          {days.map((d, idx) => {
            const isToday = isSameDay(d, today);
            const timed = (eventsByDay[idx] || []).filter((ev) => eventHourSlot(ev) != null);
            return (
              <div
                key={idx}
                className={`flex-1 border-r border-gray-200 relative ${isToday ? 'bg-orange-50/30' : ''}`}
              >
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-gray-100" />
                ))}
                {/* Events stacked side-by-side when multiple share a slot */}
                {(() => {
                  const byHour = {};
                  timed.forEach((ev) => {
                    const h = eventHourSlot(ev);
                    (byHour[h] = byHour[h] || []).push(ev);
                  });
                  return Object.entries(byHour).flatMap(([hour, evs]) =>
                    evs.map((ev, eIdx) => {
                      // For Google events with real minutes, offset within the
                      // hour cell so a 8:30 event sits halfway down the 8AM row.
                      const minute = ev._isGoogle && ev._minute != null ? ev._minute : 0;
                      const top = (Number(hour) - HOURS[0]) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
                      const colors = FILTER_BY_TYPE[eventTypeFor(ev)] || FILTER_BY_TYPE.delivery;
                      const widthPct = 100 / evs.length;
                      const leftPct = widthPct * eIdx;
                      const label =
                        ev._eventType === 'pickup' ? 'Pickup' :
                        ev._eventType === 'swap' ? 'Swap' :
                        ev._eventType === 'maintenance' ? 'Maint.' : 'Delivery';
                      return (
                        <div
                          key={`${ev.id}-${ev._eventType}-${eIdx}`}
                          onClick={() => onEventClick(ev)}
                          className="absolute rounded-lg p-2 cursor-pointer hover:shadow-md transition-shadow"
                          style={{
                            top: top + 2,
                            height: HOUR_HEIGHT - 4,
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                            backgroundColor: colors.bgHex,
                            borderLeft: `3px solid ${colors.hex}`,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            className="text-[10px] font-extrabold uppercase tracking-wider truncate"
                            style={{ color: colors.hex }}
                          >
                            {label}{ev.dumpsterSize ? ` · ${ev.dumpsterSize}` : ''}
                          </div>
                          <div className="text-[11px] font-semibold text-gray-900 truncate mt-0.5">
                            {ev.customerName}
                          </div>
                          {ev.deliveryAddress ? (
                            <div className="text-[10px] text-gray-600 truncate">
                              {ev.deliveryAddress.split(',')[0]}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  );
                })()}
              </div>
            );
          })}

          {/* Now indicator */}
          {showNow && nowTop >= 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{ top: nowTop, left: -60, right: 0, height: 2, backgroundColor: '#dc2626' }}
            >
              <div
                className="rounded-full"
                style={{ position: 'absolute', left: 54, top: -4, width: 10, height: 10, backgroundColor: '#dc2626' }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DayGrid({ currentDate, events, onEventClick }) {
  const today = new Date();
  const dayEvents = events.filter((ev) => isSameDay(ev._date, currentDate));
  const isToday = isSameDay(currentDate, today);
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const nowTop = ((nowMin - HOURS[0] * 60) / 60) * HOUR_HEIGHT;

  const byHour = {};
  dayEvents.forEach((ev) => {
    const h = WINDOW_TO_HOUR[ev.deliveryWindow] || 8;
    (byHour[h] = byHour[h] || []).push(ev);
  });

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      <div className="border-b border-gray-200 py-4 text-center">
        <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${isToday ? 'text-orange-500' : 'text-gray-500'}`}>
          {DAY_NAMES_FULL[currentDate.getDay()]}
        </p>
        {isToday ? (
          <span className="inline-block w-12 h-12 leading-[3rem] bg-orange-500 text-white rounded-full text-2xl font-extrabold">
            {currentDate.getDate()}
          </span>
        ) : (
          <p className="text-2xl font-extrabold text-gray-900">{currentDate.getDate()}</p>
        )}
      </div>
      <div className="flex-grow overflow-y-auto relative">
        <div className="absolute left-0 top-0 w-[60px] h-full border-r border-gray-200 bg-white z-10">
          {HOUR_LABELS.map((label, i) => (
            <div key={i} style={{ height: HOUR_HEIGHT }} className="flex items-start justify-end pr-2 pt-1 text-[10px] font-bold text-gray-500">
              {label}
            </div>
          ))}
        </div>
        <div className="relative" style={{ marginLeft: 60, minHeight: HOURS.length * HOUR_HEIGHT }}>
          {HOURS.map((h) => (
            <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-gray-100" />
          ))}
          {Object.entries(byHour).flatMap(([hour, evs]) =>
            evs.map((ev, eIdx) => {
              const top = (Number(hour) - HOURS[0]) * HOUR_HEIGHT;
              const colors = FILTER_BY_TYPE[eventTypeFor(ev)] || FILTER_BY_TYPE.delivery;
              const widthPct = 100 / evs.length;
              const leftPct = widthPct * eIdx;
              const label =
                ev._eventType === 'pickup' ? 'Pickup' :
                ev._eventType === 'swap' ? 'Swap' :
                ev._eventType === 'maintenance' ? 'Maintenance' : 'Delivery';
              return (
                <div
                  key={`${ev.id}-${eIdx}`}
                  onClick={() => onEventClick(ev)}
                  className="absolute rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                  style={{
                    top: top + 2,
                    height: HOUR_HEIGHT - 4,
                    left: `calc(${leftPct}% + 6px)`,
                    width: `calc(${widthPct}% - 12px)`,
                    backgroundColor: colors.bgHex,
                    borderLeft: `4px solid ${colors.hex}`,
                  }}
                >
                  <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: colors.hex }}>
                    {label}{ev.dumpsterSize ? ` · ${ev.dumpsterSize}` : ''}
                  </div>
                  <div className="text-sm font-bold text-gray-900 mt-1">{ev.customerName}</div>
                  {ev.deliveryAddress ? (
                    <div className="text-xs text-gray-700 truncate">{ev.deliveryAddress}</div>
                  ) : null}
                </div>
              );
            })
          )}
          {isToday && nowTop >= 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
            <div className="absolute z-50 pointer-events-none" style={{ top: nowTop, left: 0, right: 0, height: 2, backgroundColor: '#dc2626' }}>
              <div className="rounded-full" style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, backgroundColor: '#dc2626' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ currentDate, events, onEventClick, onDateSelect }) {
  const today = new Date();
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const gridStart = addDays(monthStart, -offset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const key = `${ev._date.getFullYear()}-${ev._date.getMonth()}-${ev._date.getDate()}`;
      (map[key] = map[key] || []).push(ev);
    });
    return map;
  }, [events]);

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_NAMES_MON.map((d) => (
          <div key={d} className="text-center py-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-grow">
        {cells.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isThisMonth = d.getMonth() === currentDate.getMonth();
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayEvents = eventsByDate[key] || [];
          return (
            <div
              key={i}
              onClick={() => onDateSelect(d)}
              className={`border-r border-b border-gray-200 p-1.5 overflow-hidden cursor-pointer hover:bg-gray-50 ${
                !isThisMonth ? 'bg-gray-50' : 'bg-white'
              } ${isToday ? 'bg-orange-50' : ''}`}
            >
              <div className="flex justify-end mb-1">
                {isToday ? (
                  <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">{d.getDate()}</span>
                ) : (
                  <span className={`text-xs font-semibold ${isThisMonth ? 'text-gray-800' : 'text-gray-400'}`}>{d.getDate()}</span>
                )}
              </div>
              {dayEvents.slice(0, 3).map((ev, idx) => {
                const colors = FILTER_BY_TYPE[eventTypeFor(ev)] || FILTER_BY_TYPE.delivery;
                return (
                  <div
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    className="text-[10px] font-semibold text-gray-900 truncate mb-0.5 px-1 py-0.5 rounded"
                    style={{ backgroundColor: colors.bgHex, borderLeft: `2px solid ${colors.hex}` }}
                  >
                    {ev.customerName}
                  </div>
                );
              })}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-gray-500 font-semibold mt-0.5">+{dayEvents.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaList({ currentDate, events, onEventClick }) {
  const today = new Date();
  const rangeStart = new Date(currentDate);
  rangeStart.setHours(0, 0, 0, 0);
  const sorted = events
    .filter((ev) => ev._date >= rangeStart)
    .sort((a, b) => a._date - b._date)
    .slice(0, 150);
  const grouped = [];
  let lastKey = null;
  sorted.forEach((ev) => {
    const key = `${ev._date.getFullYear()}-${ev._date.getMonth()}-${ev._date.getDate()}`;
    if (key !== lastKey) {
      grouped.push({ type: 'header', date: ev._date });
      lastKey = key;
    }
    grouped.push({ type: 'event', event: ev });
  });
  if (grouped.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-gray-500">
        <span className="material-symbols-outlined text-5xl mb-2">event_busy</span>
        <p className="font-medium">No upcoming events</p>
      </div>
    );
  }
  return (
    <div className="flex-grow overflow-y-auto p-8">
      {grouped.map((item, i) => {
        if (item.type === 'header') {
          const isToday = isSameDay(item.date, today);
          return (
            <div key={i} className={`flex items-center gap-3 ${i === 0 ? '' : 'mt-6'} mb-2`}>
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg ${
                  isToday ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {item.date.getDate()}
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">
                  {DAY_NAMES_FULL[item.date.getDay()]}, {MONTHS[item.date.getMonth()]} {item.date.getDate()}
                </div>
                <div className="text-xs text-gray-500">{isToday ? 'Today' : ''}</div>
              </div>
            </div>
          );
        }
        const ev = item.event;
        const colors = FILTER_BY_TYPE[eventTypeFor(ev)] || FILTER_BY_TYPE.delivery;
        const label =
          ev._eventType === 'pickup' ? 'Pickup' :
          ev._eventType === 'swap' ? 'Swap' :
          ev._eventType === 'maintenance' ? 'Maintenance' : 'Delivery';
        const hour = WINDOW_TO_HOUR[ev.deliveryWindow];
        const timeLabel = hour ? HOUR_LABELS[hour - HOURS[0]] : '';
        return (
          <div
            key={i}
            onClick={() => onEventClick(ev)}
            className="flex items-center bg-gray-50 hover:bg-gray-100 rounded-xl p-3 mb-2 ml-14 cursor-pointer transition-colors"
            style={{ borderLeft: `3px solid ${colors.hex}` }}
          >
            <div className="flex-grow">
              <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: colors.hex }}>
                {label}{ev.dumpsterSize ? ` · ${ev.dumpsterSize}` : ''}
              </div>
              <div className="text-sm font-bold text-gray-900">{ev.customerName}</div>
              {ev.deliveryAddress ? (
                <div className="text-xs text-gray-600 truncate">{ev.deliveryAddress}</div>
              ) : null}
            </div>
            {timeLabel ? <span className="text-xs font-semibold text-gray-500">{timeLabel}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

// Inject Tailwind CDN + Manrope/Material fonts once. Expo's +html.js doesn't
// apply in SPA builds, so we do it at runtime when WebSchedule mounts.
function injectAssetsOnce() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('tw-cdn')) {
    const s = document.createElement('script');
    s.id = 'tw-cdn';
    s.src = 'https://cdn.tailwindcss.com?plugins=forms,container-queries';
    document.head.appendChild(s);
  }
  if (!document.getElementById('manrope-font')) {
    const l = document.createElement('link');
    l.id = 'manrope-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  }
  if (!document.getElementById('material-icons')) {
    const l = document.createElement('link');
    l.id = 'material-icons';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
    document.head.appendChild(l);
  }
}

export default function WebSchedule() {
  const { state } = useApp();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('week');
  const [filters, setFilters] = useState({ delivery: true, pickup: true, swap: true, maintenance: true });
  const [googleEvents, setGoogleEvents] = useState([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  useEffect(() => { injectAssetsOnce(); }, []);

  // Pull Google Calendar events for a window around currentDate. The TP
  // calendar has real start/end times — these become the primary source for
  // the Schedule grid (Supabase bookings without times become "All-day").
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingGoogle(true);
      const from = new Date(currentDate);
      from.setDate(from.getDate() - 14);
      const to = new Date(currentDate);
      to.setDate(to.getDate() + 28);
      const evs = await fetchGoogleCalendarEvents(
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
      );
      if (!cancelled) {
        setGoogleEvents(evs);
        setLoadingGoogle(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  const events = useMemo(() => {
    const out = [];
    // Google Calendar events (with real hours) come first so they render on
    // top in the timed grid. Booking entries from Supabase that aren't already
    // represented by a Google event still show up for status/UI continuity.
    googleEvents.forEach((ev) => out.push(ev));

    state.bookings.forEach((b) => {
      if (b.deliveryDate) {
        const d = new Date(b.deliveryDate + 'T12:00:00');
        out.push({ ...b, _eventType: 'delivery', _date: d });
      }
      if (b.pickupDate) {
        const d = new Date(b.pickupDate + 'T12:00:00');
        out.push({ ...b, _eventType: 'pickup', _date: d, deliveryWindow: b.pickupWindow || 'morning' });
      }
    });
    return out.filter((ev) => filters[ev._eventType]);
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
  const toggleFilter = (id) => setFilters((f) => ({ ...f, [id]: !f[id] }));

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

  const handleEventClick = (ev) => {
    if (ev._isGoogle) {
      // For now Google events open the underlying Google event in a new tab.
      // Future: match to a Supabase booking by date+name and open that.
      if (ev._googleEvent?.htmlLink && typeof window !== 'undefined') {
        window.open(ev._googleEvent.htmlLink, '_blank');
      }
      return;
    }
    router.push(`/booking/${ev.id}`);
  };
  const handleCreate = () => router.push('/booking/create');

  return (
    <div className="h-screen flex bg-gray-50 font-body" style={{ fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <Sidebar
        currentDate={currentDate}
        onDateSelect={setCurrentDate}
        filters={filters}
        toggleFilter={toggleFilter}
        onCreate={handleCreate}
      />
      <main className="flex-grow flex flex-col min-w-0 h-full relative" style={{ marginLeft: 288 }}>
        <Toolbar
          title={title}
          view={view}
          setView={setView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        />
        {view === 'week' && <WeekGrid currentDate={currentDate} events={events} onEventClick={handleEventClick} />}
        {view === 'day' && <DayGrid currentDate={currentDate} events={events} onEventClick={handleEventClick} />}
        {view === 'month' && <MonthGrid currentDate={currentDate} events={events} onEventClick={handleEventClick} onDateSelect={(d) => { setCurrentDate(d); setView('day'); }} />}
        {view === 'agenda' && <AgendaList currentDate={currentDate} events={events} onEventClick={handleEventClick} />}

        <button
          onClick={handleCreate}
          className="absolute bottom-8 right-8 w-14 h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      </main>
    </div>
  );
}
