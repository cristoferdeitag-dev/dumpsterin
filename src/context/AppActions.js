// AppActions — async wrappers for mutating app state.
//
// Replaces the fire-and-forget pattern that used to live inside the reducers.
// New flow:
//   1. Caller invokes one of these functions.
//   2. Function awaits Supabase. If it fails, it throws.
//   3. Only on success does it dispatch to the reducer so local state matches DB.
//
// Callers should wrap calls in try/catch and surface the error to the user.

import {
  createBooking as sbCreateBooking,
  updateBookingFull as sbUpdateBookingFull,
  updateBookingStatus as sbUpdateStatus,
  deleteBooking as sbDeleteBooking,
  updateDumpsterStatus as sbUpdateDumpster,
  markReviewRequested as sbMarkReviewRequested,
  bulkMarkReviewsRequestedBefore as sbBulkMarkReviewsBefore,
} from '../lib/supabase';
import { useApp } from './AppContext';

function generateId(customerName) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = (customerName || 'BK').slice(0, 4).toUpperCase().replace(/\s/g, '');
  return `CAL-${date}-${prefix}`;
}

class AppActionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AppActionError';
    this.cause = cause;
  }
}

async function freeDumpster(dispatch, dumpsterId) {
  try {
    await sbUpdateDumpster(dumpsterId, 'on_yard');
    dispatch({ type: 'UPDATE_DUMPSTER', payload: { id: dumpsterId, status: 'on_yard', assignedBooking: null } });
  } catch (e) {
    console.warn('freeDumpster failed:', e);
  }
}

async function deployDumpster(dispatch, dumpsterId, bookingId) {
  try {
    await sbUpdateDumpster(dumpsterId, 'on_site');
    dispatch({ type: 'UPDATE_DUMPSTER', payload: { id: dumpsterId, status: 'on_site', assignedBooking: bookingId } });
  } catch (e) {
    console.warn('deployDumpster failed:', e);
  }
}

export function useAppActions() {
  const { state, dispatch } = useApp();

  // ── BOOKINGS ──

  async function addBooking(input) {
    const booking = {
      ...input,
      id: input.id || generateId(input.customerName),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const saved = await sbCreateBooking(booking);
    if (!saved) throw new AppActionError("Couldn't save the new booking. Check your connection and try again.");
    dispatch({ type: 'ADD_BOOKING', payload: saved });
    if (saved.assignedDumpster) {
      await deployDumpster(dispatch, saved.assignedDumpster, saved.id);
    }
    return saved;
  }

  async function updateBooking(updated) {
    const old = state.bookings.find(b => b.id === updated.id);
    const saved = await sbUpdateBookingFull(updated);
    if (!saved) throw new AppActionError("Couldn't save the booking changes. Try again.");
    dispatch({ type: 'UPDATE_BOOKING', payload: saved });

    // Dumpster reconciliation: free old, deploy new, free terminal states.
    if (old?.assignedDumpster && old.assignedDumpster !== saved.assignedDumpster) {
      await freeDumpster(dispatch, old.assignedDumpster);
    }
    if (saved.assignedDumpster && saved.assignedDumpster !== old?.assignedDumpster) {
      await deployDumpster(dispatch, saved.assignedDumpster, saved.id);
    }
    if ((saved.status === 'completed' || saved.status === 'cancelled') && saved.assignedDumpster) {
      await freeDumpster(dispatch, saved.assignedDumpster);
    }
    return saved;
  }

  async function updateBookingStatus(bookingId, status) {
    await sbUpdateStatus(bookingId, status);
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { bookingId, status } });
    const booking = state.bookings.find(b => b.id === bookingId);
    if ((status === 'completed' || status === 'cancelled') && booking?.assignedDumpster) {
      await freeDumpster(dispatch, booking.assignedDumpster);
    }
  }

  async function deleteBooking(id) {
    const booking = state.bookings.find(b => b.id === id);
    await sbDeleteBooking(id);
    dispatch({ type: 'DELETE_BOOKING', payload: id });
    if (booking?.assignedDumpster) {
      await freeDumpster(dispatch, booking.assignedDumpster);
    }
  }

  async function markReviewRequested(id, timestamp) {
    await sbMarkReviewRequested(id, timestamp);
    dispatch({ type: 'MARK_REVIEW_REQUESTED', payload: { id, timestamp } });
  }

  async function bulkMarkReviewsBefore(isoDate) {
    const n = await sbBulkMarkReviewsBefore(isoDate);
    dispatch({ type: 'BULK_MARK_REVIEWS_BEFORE', payload: { isoDate } });
    return n;
  }

  // ── DUMPSTERS ──

  async function updateDumpsterStatus(id, status) {
    await sbUpdateDumpster(id, status);
    dispatch({ type: 'UPDATE_DUMPSTER', payload: { id, status } });
  }

  // ADD_DUMPSTER is currently used only for local mock additions. When/if we
  // add a Supabase create-dumpster RPC, mirror the pattern above.
  function addDumpsterLocalOnly(dumpster) {
    dispatch({ type: 'ADD_DUMPSTER', payload: dumpster });
  }

  return {
    addBooking,
    updateBooking,
    updateBookingStatus,
    deleteBooking,
    markReviewRequested,
    bulkMarkReviewsBefore,
    updateDumpsterStatus,
    addDumpsterLocalOnly,
  };
}
