import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { initialBookings, initialDumpsters, initialDrivers } from '../data/mockData';
import {
  fetchBookings, fetchDumpsters, fetchDrivers,
  createBooking as sbCreateBooking,
  updateBookingStatus as sbUpdateStatus,
  deleteBooking as sbDeleteBooking,
  updateDumpsterStatus as sbUpdateDumpster,
} from '../lib/supabase';

const AppContext = createContext();

function generateId(customerName) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = (customerName || 'BK').slice(0, 4).toUpperCase().replace(/\s/g, '');
  return `CAL-${date}-${prefix}`;
}

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, ...action.payload, loading: false };

    case 'ADD_BOOKING': {
      const booking = { ...action.payload, id: action.payload.id || generateId(action.payload.customerName), createdAt: new Date().toISOString().slice(0, 10) };
      // Save to Supabase (fire and forget)
      sbCreateBooking(booking).catch(e => console.error('Supabase create error:', e));
      let dumpsters = state.dumpsters;
      if (booking.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === booking.assignedDumpster ? { ...d, status: 'on_site', assignedBooking: booking.id } : d
        );
        sbUpdateDumpster(booking.assignedDumpster, 'on_site').catch(() => {});
      }
      return { ...state, bookings: [...state.bookings, booking], dumpsters };
    }
    case 'UPDATE_BOOKING': {
      const updated = action.payload;
      const old = state.bookings.find(b => b.id === updated.id);
      let dumpsters = state.dumpsters;
      if (old?.assignedDumpster && old.assignedDumpster !== updated.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === old.assignedDumpster ? { ...d, status: 'on_yard', assignedBooking: null } : d
        );
        sbUpdateDumpster(old.assignedDumpster, 'on_yard').catch(() => {});
      }
      if (updated.assignedDumpster && updated.assignedDumpster !== old?.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === updated.assignedDumpster ? { ...d, status: 'on_site', assignedBooking: updated.id } : d
        );
        sbUpdateDumpster(updated.assignedDumpster, 'on_site').catch(() => {});
      }
      if ((updated.status === 'completed' || updated.status === 'cancelled') && updated.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === updated.assignedDumpster ? { ...d, status: 'on_yard', assignedBooking: null } : d
        );
        sbUpdateDumpster(updated.assignedDumpster, 'on_yard').catch(() => {});
      }
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === updated.id ? updated : b),
        dumpsters,
      };
    }
    case 'DELETE_BOOKING': {
      const booking = state.bookings.find(b => b.id === action.payload);
      sbDeleteBooking(action.payload).catch(() => {});
      let dumpsters = state.dumpsters;
      if (booking?.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === booking.assignedDumpster ? { ...d, status: 'on_yard', assignedBooking: null } : d
        );
        sbUpdateDumpster(booking.assignedDumpster, 'on_yard').catch(() => {});
      }
      return {
        ...state,
        bookings: state.bookings.filter(b => b.id !== action.payload),
        dumpsters,
      };
    }
    case 'UPDATE_DUMPSTER': {
      const { id, status } = action.payload;
      sbUpdateDumpster(id, status).catch(() => {});
      return {
        ...state,
        dumpsters: state.dumpsters.map(d => d.id === id ? { ...d, ...action.payload } : d),
      };
    }
    case 'ADD_DUMPSTER':
      return { ...state, dumpsters: [...state.dumpsters, action.payload] };
    case 'UPDATE_BOOKING_STATUS': {
      const { bookingId, status } = action.payload;
      sbUpdateStatus(bookingId, status).catch(() => {});
      let dumpsters = state.dumpsters;
      const booking = state.bookings.find(b => b.id === bookingId);
      if ((status === 'completed' || status === 'cancelled') && booking?.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === booking.assignedDumpster ? { ...d, status: 'on_yard', assignedBooking: null } : d
        );
        sbUpdateDumpster(booking.assignedDumpster, 'on_yard').catch(() => {});
      }
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === bookingId ? { ...b, status } : b),
        dumpsters,
      };
    }
    default:
      return state;
  }
}

// Fallback to mock data if Supabase fails
function getInitialState() {
  const dumpsters = [...initialDumpsters];
  initialBookings.forEach(b => {
    if (b.assignedDumpster && b.status !== 'completed' && b.status !== 'cancelled') {
      const idx = dumpsters.findIndex(d => d.id === b.assignedDumpster);
      if (idx >= 0) {
        dumpsters[idx] = { ...dumpsters[idx], status: 'on_site', assignedBooking: b.id };
      }
    }
  });
  return { bookings: initialBookings, dumpsters, drivers: initialDrivers, loading: true };
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, null, getInitialState);

  // Load data from Supabase on mount
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        const [bookings, dumpsters, drivers] = await Promise.all([
          fetchBookings(),
          fetchDumpsters(),
          fetchDrivers(),
        ]);

        if (bookings.length > 0 || dumpsters.length > 0) {
          dispatch({
            type: 'SET_DATA',
            payload: {
              bookings: bookings.length > 0 ? bookings : initialBookings,
              dumpsters: dumpsters.length > 0 ? dumpsters : initialDumpsters,
              drivers: drivers.length > 0 ? drivers : initialDrivers,
            },
          });
          console.log(`Loaded from Supabase: ${bookings.length} bookings, ${dumpsters.length} dumpsters, ${drivers.length} drivers`);
        } else {
          dispatch({ type: 'SET_DATA', payload: { loading: false } });
          console.log('Supabase empty, using mock data');
        }
      } catch (err) {
        console.error('Supabase load failed, using mock data:', err);
        dispatch({ type: 'SET_DATA', payload: { loading: false } });
      }
    }
    loadFromSupabase();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
