// Reads Google Calendar events from the tpdumpsters.com endpoint that proxies
// the service-account Calendar API. Returns a list of events shaped for the
// Schedule UI — already mapped into a synthetic "booking-like" object so the
// existing renderers can show them without branching everywhere.

const EVENTS_ENDPOINT = 'https://tpdumpsters.com/api/calendar/events';

function parseTitle(summary) {
  // TP titles often look like "Kenny 20YD delivery" or "John Doe pickup".
  // Try to extract size and type heuristically.
  const s = (summary || '').toLowerCase();
  let _eventType = 'delivery';
  if (s.includes('pickup') || s.includes('pick up') || s.includes('pick-up')) _eventType = 'pickup';
  else if (s.includes('swap')) _eventType = 'swap';
  else if (s.includes('maint')) _eventType = 'maintenance';

  let dumpsterSize = '';
  const m = summary && summary.match(/(\d{1,2})\s*(?:yd|yard|gd)/i);
  if (m) dumpsterSize = `${m[1]}yd`;

  // Strip the size/type tokens to get a customer-ish name.
  const customerName = (summary || '')
    .replace(/(\d{1,2})\s*(?:yd|yard|gd)/i, '')
    .replace(/delivery|pickup|pick\s*up|pick-up|swap|maintenance/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || summary || '(no title)';

  return { _eventType, dumpsterSize, customerName };
}

export async function fetchGoogleCalendarEvents(from, to) {
  try {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const url = `${EVENTS_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('Calendar events fetch failed', res.status);
      return [];
    }
    const data = await res.json();
    return (data.events || []).map((ev) => {
      const start = new Date(ev.start);
      const parsed = parseTitle(ev.summary);
      // Map to the shape Schedule expects. We use 'extId' so we don't collide
      // with real booking IDs — clicking opens the Google event in a new tab.
      return {
        id: `gcal:${ev.id}`,
        bookingNumber: '',
        customerName: parsed.customerName,
        deliveryAddress: ev.location || '',
        dumpsterSize: parsed.dumpsterSize,
        deliveryWindow: '',
        _eventType: parsed._eventType,
        _date: start,
        _googleEvent: ev,
        _isGoogle: true,
        // Exact start hour (24h) so the grid places it correctly.
        _hour: ev.allDay ? null : start.getHours(),
        _minute: ev.allDay ? null : start.getMinutes(),
        _allDay: !!ev.allDay,
      };
    });
  } catch (e) {
    console.warn('Calendar events error', e);
    return [];
  }
}
