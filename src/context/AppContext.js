import React, { createContext, useContext, useReducer } from 'react';
import { initialBookings, initialDumpsters, initialDrivers } from '../data/mockData';

const AppContext = createContext();

function generateId(customerName) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = customerName.slice(0, 4).toUpperCase().replace(/\s/g, '');
  return `CAL-${date}-${prefix}`;
}

function appReducer(state, action) {
  switch (action.type) {
    case 'ADD_BOOKING': {
      const booking = { ...action.payload, id: generateId(action.payload.customerName), createdAt: new Date().toISOString().slice(0, 10) };
      let dumpsters = state.dumpsters;
      if (booking.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === booking.assignedDumpster ? { ...d, status: 'deployed', assignedBooking: booking.id } : d
        );
      }
      return { ...state, bookings: [...state.bookings, booking], dumpsters };
    }
    case 'UPDATE_BOOKING': {
      const updated = action.payload;
      const old = state.bookings.find(b => b.id === updated.id);
      let dumpsters = state.dumpsters;
      // Release old dumpster if changed
      if (old?.assignedDumpster && old.assignedDumpster !== updated.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === old.assignedDumpster ? { ...d, status: 'available', assignedBooking: null } : d
        );
      }
      // Assign new dumpster
      if (updated.assignedDumpster && updated.assignedDumpster !== old?.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === updated.assignedDumpster ? { ...d, status: 'deployed', assignedBooking: updated.id } : d
        );
      }
      // If completed or cancelled, release dumpster
      if ((updated.status === 'completed' || updated.status === 'cancelled') && updated.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === updated.assignedDumpster ? { ...d, status: 'available', assignedBooking: null } : d
        );
      }
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === updated.id ? updated : b),
        dumpsters,
      };
    }
    case 'DELETE_BOOKING': {
      const booking = state.bookings.find(b => b.id === action.payload);
      let dumpsters = state.dumpsters;
      if (booking?.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === booking.assignedDumpster ? { ...d, status: 'available', assignedBooking: null } : d
        );
      }
      return {
        ...state,
        bookings: state.bookings.filter(b => b.id !== action.payload),
        dumpsters,
      };
    }
    case 'UPDATE_DUMPSTER':
      return {
        ...state,
        dumpsters: state.dumpsters.map(d => d.id === action.payload.id ? { ...d, ...action.payload } : d),
      };
    case 'ADD_DUMPSTER':
      return { ...state, dumpsters: [...state.dumpsters, action.payload] };
    case 'UPDATE_BOOKING_STATUS': {
      const { bookingId, status } = action.payload;
      let dumpsters = state.dumpsters;
      const booking = state.bookings.find(b => b.id === bookingId);
      if ((status === 'completed' || status === 'cancelled') && booking?.assignedDumpster) {
        dumpsters = dumpsters.map(d =>
          d.id === booking.assignedDumpster ? { ...d, status: 'available', assignedBooking: null } : d
        );
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

// Sync initial dumpster statuses with bookings
function getInitialState() {
  const dumpsters = [...initialDumpsters];
  initialBookings.forEach(b => {
    if (b.assignedDumpster && b.status !== 'completed' && b.status !== 'cancelled') {
      const idx = dumpsters.findIndex(d => d.id === b.assignedDumpster);
      if (idx >= 0) {
        dumpsters[idx] = { ...dumpsters[idx], status: 'deployed', assignedBooking: b.id };
      }
    }
  });
  return { bookings: initialBookings, dumpsters, drivers: initialDrivers };
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, null, getInitialState);
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
