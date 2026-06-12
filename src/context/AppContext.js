import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { fetchBookings, fetchDumpsters, fetchDrivers, autoCloseStaleBookings } from '../lib/supabase';
import { useAuth } from './AuthContext';

const AppContext = createContext();

// Pure reducer — no async / no side effects. All Supabase writes live in
// AppActions.js, which awaits the write and only dispatches here on success.
function appReducer(state, action) {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, ...action.payload, loading: false };

    case 'ADD_BOOKING':
      return { ...state, bookings: [...state.bookings, action.payload] };

    case 'UPDATE_BOOKING':
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === action.payload.id ? action.payload : b),
      };

    case 'UPDATE_BOOKING_STATUS': {
      const { bookingId, status } = action.payload;
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === bookingId ? { ...b, status } : b),
      };
    }

    case 'DELETE_BOOKING':
      return { ...state, bookings: state.bookings.filter(b => b.id !== action.payload) };

    case 'MARK_REVIEW_REQUESTED': {
      const { id, timestamp } = action.payload;
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === id ? { ...b, reviewRequestedAt: timestamp } : b),
      };
    }

    case 'BULK_MARK_REVIEWS_BEFORE': {
      const { isoDate } = action.payload;
      const now = new Date().toISOString();
      return {
        ...state,
        bookings: state.bookings.map(b => {
          if (b.reviewRequestedAt) return b;
          if (!['on_site', 'completed', 'picked_up', 'ready_for_pickup'].includes(b.status)) return b;
          if ((b.deliveryDate || '') > isoDate) return b;
          return { ...b, reviewRequestedAt: now };
        }),
      };
    }

    case 'UPDATE_DUMPSTER': {
      const { id } = action.payload;
      return {
        ...state,
        dumpsters: state.dumpsters.map(d => d.id === id ? { ...d, ...action.payload } : d),
      };
    }

    case 'ADD_DUMPSTER':
      return { ...state, dumpsters: [...state.dumpsters, action.payload] };

    default:
      return state;
  }
}

// Empty until Supabase answers. Showing stale demo data here made providers
// believe their real bookings had vanished — an honest error beats a lie.
function getInitialState() {
  return { bookings: [], dumpsters: [], drivers: [], loading: true, loadError: false };
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, null, getInitialState);
  const { isAuthenticated, hasCompany, companyId, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !hasCompany || !companyId) {
      dispatch({
        type: 'SET_DATA',
        payload: { bookings: [], dumpsters: [], drivers: [], loading: false },
      });
      return;
    }

    async function loadFromSupabase() {
      try {
        let [bookings, dumpsters, drivers] = await Promise.all([
          fetchBookings(),
          fetchDumpsters(),
          fetchDrivers(),
        ]);
        bookings = await autoCloseStaleBookings(bookings || []);
        dispatch({
          type: 'SET_DATA',
          payload: {
            bookings: bookings || [],
            dumpsters: dumpsters || [],
            drivers: drivers || [],
            loadError: false,
          },
        });
        console.log(`Loaded: ${bookings.length} bookings, ${dumpsters.length} dumpsters, ${drivers.length} drivers`);
      } catch (err) {
        console.error('Supabase load failed:', err);
        dispatch({
          type: 'SET_DATA',
          payload: { bookings: [], dumpsters: [], drivers: [], loading: false, loadError: true },
        });
      }
    }
    loadFromSupabase();
  }, [isAuthenticated, hasCompany, companyId, authLoading]);

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
