// AppActions — async wrappers for mutating app state.
//
// Flow:
//   1. Caller invokes an action.
//   2. Action awaits Supabase. If it fails, it throws.
//   3. Only on success does it dispatch to the reducer.
//
// Some flows compose multiple writes (e.g. addBooking also flips the assigned
// dumpster to "on_site"). When the *primary* write succeeds but a *secondary*
// write fails, we throw a `PartialStateError` so the caller can show a clear
// message — "booking saved but dumpster wasn't reassigned, fix it manually".
// We never silently swallow the secondary failure.

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

export class PartialStateError extends Error {
  constructor(message, { primarySaved = true, cause } = {}) {
    super(message);
    this.name = 'PartialStateError';
    this.primarySaved = primarySaved;
    this.cause = cause;
  }
}

// Helpers — these THROW on Supabase failure (no console.warn swallowing).
async function freeDumpster(dispatch, dumpsterId) {
  await sbUpdateDumpster(dumpsterId, 'on_yard');
  dispatch({ type: 'UPDATE_DUMPSTER', payload: { id: dumpsterId, status: 'on_yard', assignedBooking: null } });
}

async function deployDumpster(dispatch, dumpsterId, bookingId) {
  await sbUpdateDumpster(dumpsterId, 'on_site');
  dispatch({ type: 'UPDATE_DUMPSTER', payload: { id: dumpsterId, status: 'on_site', assignedBooking: bookingId } });
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
    dispatch({ type: 'ADD_BOOKING', payload: saved });
    if (saved.assignedDumpster) {
      try {
        await deployDumpster(dispatch, saved.assignedDumpster, saved.id);
      } catch (e) {
        throw new PartialStateError(
          "Booking saved, but couldn't assign the dumpster. Open Inventory and assign it manually.",
          { primarySaved: true, cause: e }
        );
      }
    }
    return saved;
  }

  async function updateBooking(updated) {
    const old = state.bookings.find(b => b.id === updated.id);
    const saved = await sbUpdateBookingFull(updated);
    dispatch({ type: 'UPDATE_BOOKING', payload: saved });

    const dumpsterErrors = [];

    if (old?.assignedDumpster && old.assignedDumpster !== saved.assignedDumpster) {
      try { await freeDumpster(dispatch, old.assignedDumpster); }
      catch (e) { dumpsterErrors.push(`Couldn't free dumpster ${old.assignedDumpster}: ${e.message}`); }
    }
    if (saved.assignedDumpster && saved.assignedDumpster !== old?.assignedDumpster) {
      try { await deployDumpster(dispatch, saved.assignedDumpster, saved.id); }
      catch (e) { dumpsterErrors.push(`Couldn't assign dumpster ${saved.assignedDumpster}: ${e.message}`); }
    }
    if ((saved.status === 'completed' || saved.status === 'cancelled') && saved.assignedDumpster) {
      try { await freeDumpster(dispatch, saved.assignedDumpster); }
      catch (e) { dumpsterErrors.push(`Couldn't free dumpster ${saved.assignedDumpster}: ${e.message}`); }
    }

    if (dumpsterErrors.length > 0) {
      throw new PartialStateError(
        `Booking saved, but dumpster status didn't sync:\n${dumpsterErrors.join('\n')}\nOpen Inventory to fix.`,
        { primarySaved: true }
      );
    }
    return saved;
  }

  async function updateBookingStatus(bookingId, status) {
    await sbUpdateStatus(bookingId, status);
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { bookingId, status } });
    const booking = state.bookings.find(b => b.id === bookingId);
    if ((status === 'completed' || status === 'cancelled') && booking?.assignedDumpster) {
      try {
        await freeDumpster(dispatch, booking.assignedDumpster);
      } catch (e) {
        throw new PartialStateError(
          `Status saved, but dumpster ${booking.assignedDumpster} wasn't freed. Open Inventory to fix.`,
          { primarySaved: true, cause: e }
        );
      }
    }
  }

  async function deleteBooking(id) {
    const booking = state.bookings.find(b => b.id === id);
    await sbDeleteBooking(id);
    dispatch({ type: 'DELETE_BOOKING', payload: id });
    if (booking?.assignedDumpster) {
      try {
        await freeDumpster(dispatch, booking.assignedDumpster);
      } catch (e) {
        throw new PartialStateError(
          `Booking deleted, but dumpster ${booking.assignedDumpster} wasn't freed. Open Inventory to fix.`,
          { primarySaved: true, cause: e }
        );
      }
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
