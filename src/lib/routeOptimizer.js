// Route suggestion v1 — nearest-neighbor heuristic over today's jobs.
// Good enough to answer the owner's real question ("after Martinez, do I go
// back to the yard or straight to the next job?") without paying for the
// Google Distance Matrix yet. Straight-line miles × an urban factor gives
// usable ETAs; real traffic times can replace distanceMiles() later without
// touching the callers.

const EARTH_R_MI = 3958.8;
// Surface streets + freeway mix in Contra Costa ≈ 28 mph door to door.
const AVG_MPH = 28;
// Roads are never straight lines; 1.3 is the standard detour factor.
const DETOUR = 1.3;

export function distanceMiles(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_MI * Math.asin(Math.sqrt(s)) * DETOUR;
}

export function driveMinutes(miles) {
  if (miles == null) return null;
  return Math.round((miles / AVG_MPH) * 60) + 4; // +4 min park/maneuver
}

function nearestNeighborOrder(start, jobs) {
  const remaining = [...jobs];
  const ordered = [];
  let current = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceMiles(current, remaining[i]) ?? 9999;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push({ ...next, _legMiles: bestDist === 9999 ? null : bestDist });
    if (next.lat != null) current = next;
  }
  return ordered;
}

// jobs: [{...booking, _jobType: 'delivery'|'pickup', lat, lng, window}]
// locations: { yard: {lat,lng}, transfer_station: {lat,lng} }
export function suggestRoute(jobs, locations) {
  const yard = locations?.yard || null;
  const transfer = locations?.transfer_station || null;

  // Morning windows first inside each group — a 7-9AM promise beats distance.
  const isMorning = (j) => /am|morning|7|8|9/i.test(String(j.window || ''));
  const deliveries = jobs.filter((j) => j._jobType === 'delivery');
  const pickups = jobs.filter((j) => j._jobType === 'pickup');

  const orderedDeliveries = [
    ...nearestNeighborOrder(yard, deliveries.filter(isMorning)),
    ...nearestNeighborOrder(yard, deliveries.filter((j) => !isMorning(j))),
  ];

  const lastDelivery = orderedDeliveries.filter((j) => j.lat != null).slice(-1)[0] || yard;
  const orderedPickups = nearestNeighborOrder(lastDelivery, pickups);

  const steps = [];
  let cursor = yard;
  if (yard) steps.push({ kind: 'start', label: 'Leave the yard', loc: yard });

  for (const j of orderedDeliveries) {
    const miles = distanceMiles(cursor, j);
    steps.push({ kind: 'delivery', job: j, miles, minutes: driveMinutes(miles) });
    if (j.lat != null) cursor = j;
  }
  for (const j of orderedPickups) {
    const miles = distanceMiles(cursor, j);
    steps.push({ kind: 'pickup', job: j, miles, minutes: driveMinutes(miles) });
    if (j.lat != null) cursor = j;
  }
  // Full boxes on board → dump before going home.
  if (orderedPickups.length > 0 && transfer) {
    const miles = distanceMiles(cursor, transfer);
    steps.push({ kind: 'transfer', label: 'Unload at transfer station', miles, minutes: driveMinutes(miles), loc: transfer });
    cursor = transfer;
  }
  if (yard) {
    const miles = distanceMiles(cursor, yard);
    steps.push({ kind: 'end', label: 'Back to the yard', miles, minutes: driveMinutes(miles), loc: yard });
  }

  const totalMiles = steps.reduce((s, st) => s + (st.miles || 0), 0);
  const totalMinutes = steps.reduce((s, st) => s + (st.minutes || 0), 0)
    + orderedDeliveries.length * 12 // avg drop time
    + orderedPickups.length * 15;   // avg hook + tarp time

  return {
    steps,
    totalMiles: Math.round(totalMiles),
    totalMinutes,
    jobsWithoutCoords: jobs.filter((j) => j.lat == null).length,
  };
}
