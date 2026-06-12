import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useAuth } from '../src/context/AuthContext';
import { suggestRoute, driveMinutes } from '../src/lib/routeOptimizer';

// TODAY — the whole day's work on one screen (Cris 2026-06-12: "que sea muy
// visible el calendario del trabajo del día"). Deliveries and pickups for
// today, ordered by window, with one-tap navigate/call and the route
// suggestion on top.

const STATUS_COLORS = {
  scheduled: { bg: '#EAF1FB', fg: '#1D4ED8', label: 'Scheduled' },
  in_transit: { bg: '#FFF3CD', fg: '#8a6d00', label: 'On the way' },
  on_site: { bg: '#E6F4EA', fg: '#1E7E34', label: 'On site' },
  delivered: { bg: '#E6F4EA', fg: '#1E7E34', label: 'Delivered' },
  ready_for_pickup: { bg: '#FDEBD0', fg: '#B9770E', label: 'Ready for pickup' },
  pickup_ready: { bg: '#FDEBD0', fg: '#B9770E', label: 'Ready for pickup' },
  picked_up: { bg: '#E8E8E8', fg: '#444', label: 'Picked up' },
  completed: { bg: '#E8E8E8', fg: '#444', label: 'Completed' },
};

function statusChip(status) {
  return STATUS_COLORS[status] || { bg: '#F2F2F2', fg: '#555', label: status || '—' };
}

function windowSortKey(w) {
  const m = String(w || '').match(/(\d{1,2})/);
  if (!m) return 99;
  let h = parseInt(m[1], 10);
  if (/pm/i.test(String(w)) && h < 12) h += 12;
  return h;
}

function openMaps(address) {
  const q = encodeURIComponent(address || '');
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
}

function JobCard({ job, kind, router }) {
  const chip = statusChip(job.status);
  return (
    <TouchableOpacity
      onPress={() => router.push(`/booking/${job.id}`)}
      style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8E8E8', padding: 12, marginBottom: 8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ backgroundColor: kind === 'delivery' ? '#14213D' : '#B9770E', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
          <Text style={{ color: '#FFCD11', fontSize: 11, fontWeight: '800' }}>
            {kind === 'delivery' ? 'DROP' : 'PICKUP'} · {job.dumpsterSize || '?'}
          </Text>
        </View>
        <Text style={{ fontWeight: '800', fontSize: 13, color: '#1A1A1A', flex: 1 }} numberOfLines={1}>
          {(kind === 'delivery' ? job.deliveryWindow : job.pickupWindow || job.deliveryWindow) || 'Anytime'} · {job.customerName}
        </Text>
        <View style={{ backgroundColor: chip.bg, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: chip.fg, fontSize: 10, fontWeight: '800' }}>{chip.label}</Text>
        </View>
      </View>
      <Text style={{ color: '#555', fontSize: 12, marginBottom: 8 }} numberOfLines={1}>
        {job.deliveryAddress || 'No address'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={() => openMaps(job.deliveryAddress)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2F2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Ionicons name="navigate-outline" size={14} color="#1A1A1A" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>Navigate</Text>
        </TouchableOpacity>
        {!!job.phone && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${String(job.phone).replace(/[^\d+]/g, '')}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2F2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Ionicons name="call-outline" size={14} color="#1A1A1A" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>Call</Text>
          </TouchableOpacity>
        )}
        {!!job.assignedDumpster && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 6 }}>
            <Ionicons name="cube-outline" size={14} color="#888" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#888' }}>{job.assignedDumpster}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const { state } = useApp();
  const { profile } = useAuth();
  const [route, setRoute] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const niceDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const { deliveries, pickups, doneCount } = useMemo(() => {
    const live = (b) => !['cancelled'].includes(b.status);
    const done = (b) => ['completed', 'picked_up'].includes(b.status);
    const del = state.bookings
      .filter((b) => live(b) && b.deliveryDate === today)
      .sort((a, b2) => windowSortKey(a.deliveryWindow) - windowSortKey(b2.deliveryWindow));
    const pick = state.bookings
      .filter((b) => live(b) && b.pickupDate === today)
      .sort((a, b2) => windowSortKey(a.pickupWindow || a.deliveryWindow) - windowSortKey(b2.pickupWindow || b2.deliveryWindow));
    const doneCount2 =
      del.filter((b) => ['on_site', 'delivered', 'completed'].includes(b.status)).length +
      pick.filter(done).length;
    return { deliveries: del, pickups: pick, doneCount: doneCount2 };
  }, [state.bookings, today]);

  const locations = profile?.companies?.settings?.locations || null;

  function buildRoute() {
    const jobs = [
      ...deliveries
        .filter((b) => !['on_site', 'delivered', 'completed'].includes(b.status))
        .map((b) => ({ ...b, _jobType: 'delivery', window: b.deliveryWindow })),
      ...pickups
        .filter((b) => !['picked_up', 'completed'].includes(b.status))
        .map((b) => ({ ...b, _jobType: 'pickup', window: b.pickupWindow || b.deliveryWindow })),
    ];
    setRoute(suggestRoute(jobs, locations));
  }

  const totalJobs = deliveries.length + pickups.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F7' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#14213D' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#FFCD11" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFFFF' }}>Today</Text>
          <Text style={{ fontSize: 12, color: '#9fb0d0', fontWeight: '600' }}>{niceDate}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: '#FFCD11', fontWeight: '800', fontSize: 18 }}>{doneCount}/{totalJobs}</Text>
          <Text style={{ color: '#9fb0d0', fontSize: 11, fontWeight: '600' }}>done</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Summary + route button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E8E8E8', paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: '#14213D' }}>{deliveries.length}</Text>
              <Text style={{ fontSize: 11, color: '#666', fontWeight: '700' }}>deliveries</Text>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E8E8E8', paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: '#B9770E' }}>{pickups.length}</Text>
              <Text style={{ fontSize: 11, color: '#666', fontWeight: '700' }}>pickups</Text>
            </View>
          </View>
          {totalJobs > 0 && (
            <TouchableOpacity
              onPress={buildRoute}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFCD11', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }}
            >
              <Ionicons name="git-branch-outline" size={16} color="#14213D" />
              <Text style={{ fontWeight: '800', fontSize: 13, color: '#14213D' }}>Suggest route</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Suggested route */}
        {route && (
          <View style={{ backgroundColor: '#14213D', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: '#FFCD11', fontWeight: '800', fontSize: 14, flex: 1 }}>
                Suggested route · ~{Math.round(route.totalMinutes / 60 * 10) / 10}h · {route.totalMiles} mi
              </Text>
              <TouchableOpacity onPress={() => setRoute(null)}>
                <Ionicons name="close" size={18} color="#9fb0d0" />
              </TouchableOpacity>
            </View>
            {route.steps.map((st, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                <Text style={{ color: '#9fb0d0', width: 22, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
                <Ionicons
                  name={st.kind === 'delivery' ? 'arrow-down-circle' : st.kind === 'pickup' ? 'arrow-up-circle' : st.kind === 'transfer' ? 'trash' : 'home'}
                  size={15}
                  color={st.kind === 'delivery' ? '#85cfff' : st.kind === 'pickup' ? '#FFCD11' : '#9fb0d0'}
                  style={{ marginRight: 6 }}
                />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {st.job ? `${st.job.customerName} (${st.job.dumpsterSize || '?'})` : st.label}
                </Text>
                {st.miles != null && (
                  <Text style={{ color: '#9fb0d0', fontSize: 11, fontWeight: '700' }}>
                    {Math.round(st.miles)} mi · {st.minutes} min
                  </Text>
                )}
              </View>
            ))}
            {route.jobsWithoutCoords > 0 && (
              <Text style={{ color: '#ffb4ab', fontSize: 11, marginTop: 6 }}>
                {route.jobsWithoutCoords} job(s) have no GPS yet and were placed last.
              </Text>
            )}
            <Text style={{ color: '#9fb0d0', fontSize: 11, marginTop: 8 }}>
              Straight-line estimate — morning windows first, then nearest first. Ask the Assistant "what's the best route today?" for the reasoning.
            </Text>
          </View>
        )}

        {/* Deliveries */}
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 }}>
          Deliveries ({deliveries.length})
        </Text>
        {deliveries.length === 0 && (
          <Text style={{ color: '#888', marginBottom: 14 }}>No deliveries today.</Text>
        )}
        {deliveries.map((b) => (
          <JobCard key={`d-${b.id}`} job={b} kind="delivery" router={router} />
        ))}

        {/* Pickups */}
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginTop: 10, marginBottom: 8 }}>
          Pickups ({pickups.length})
        </Text>
        {pickups.length === 0 && (
          <Text style={{ color: '#888' }}>No pickups today.</Text>
        )}
        {pickups.map((b) => (
          <JobCard key={`p-${b.id}`} job={b} kind="pickup" router={router} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
