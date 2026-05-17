// Unified Dumpsterin / BookingDumpsters design tokens.
//
// Palette anchored on CAT Yellow (#FFCD11) per the BD web brand. Charcoal
// blue (#14213D) replaces the previous Warm Amber primary for dark surfaces,
// active tabs, headers. Yellow stays reserved for the single primary CTA per
// screen so it pops.

// Backgrounds — light surface stack
export const bg = '#FFFFFF';
export const bgCard = '#FFFFFF';
export const bgElevated = '#FAFAFA';
export const bgInput = '#FFFFFF';
export const bgSurface = '#FAFAFA';
export const border = '#E5E5E5';
export const borderActive = '#FFCD11';

// Primary (CAT Yellow) — the single most important action on each screen
export const primary = '#FFCD11';
export const primaryLight = '#FFE066';
export const primaryDark = '#E5B800';
export const onPrimary = '#1A1A1A';

// Accent (Charcoal Blue) — secondary surfaces, active tabs, dark callouts
export const accent = '#14213D';
export const accentLight = '#2B3A5A';
export const onAccent = '#FFCD11';

// Status
export const success = '#00C853';
export const warning = '#FFCD11';
export const danger = '#C00';
export const info = '#3B82F6';
export const infoDark = '#1D4ED8';

// Text
export const text = '#1A1A1A';
export const textSecondary = '#666666';
export const textMuted = '#999999';

// Typography (web; native picks defaults)
export const fontHeadline = 'DM Sans, system-ui, sans-serif';
export const fontBody = 'Inter, system-ui, sans-serif';

// Booking statuses — kept distinguishable but inside the new family
export const status = {
  quote_pending: '#999999',
  quote_sent: '#999999',
  scheduled: '#3B82F6',
  in_transit: '#FFCD11',
  delivered: '#1A1A1A',
  on_site: '#00C853',
  pickup_ready: '#3B82F6',
  ready_for_pickup: '#3B82F6',
  picked_up: '#14213D',
  dumping: '#FFCD11',
  completed: '#999999',
  cancelled: '#FFB4AB',
};

export const colors = {
  bg, bgCard, bgElevated, bgInput, bgSurface, border, borderActive,
  primary, primaryLight, primaryDark, onPrimary,
  accent, accentLight, onAccent,
  success, warning, danger, info, infoDark,
  text, textSecondary, textMuted,
  fontHeadline, fontBody,
  status,
};

export default colors;
