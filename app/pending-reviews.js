import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Linking,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useApp } from '../src/context/AppContext';

const C = {
  surface: '#FFFFFF',
  surfaceLow: '#F7F7F7',
  surfaceHigh: '#EEEEEE',
  surfaceHighest: '#E8E8E8',
  primary: '#ffb77d',
  primaryContainer: '#ff8c00',
  onPrimary: '#4d2600',
  onSurface: '#1A1A1A',
  onSurfaceVariant: '#666666',
  muted: '#999999',
  tertiary: '#85cfff',
  success: '#00C853',
};

const REVIEW_LINK = 'https://g.page/r/CZkuWPnV8jk9EAE/review';
const REVIEW_MESSAGE = `Hi! If you have a moment, we'd really appreciate your feedback 😊\n${REVIEW_LINK}`;

// Statuses that count as "completed / work done" so they qualify for a review request
const COMPLETED_STATUSES = ['on_site', 'completed', 'picked_up', 'ready_for_pickup', 'dumping'];

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + 'T00:00:00');
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPhoneForSms(phone) {
  // iOS sms: URI scheme wants digits only (or with +)
  return (phone || '').replace(/[^\d+]/g, '');
}

export default function PendingReviewsScreen() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const bookings = state.bookings || [];

  const [showBulkCal, setShowBulkCal] = useState(false);

  const pending = useMemo(() => {
    return bookings
      .filter(b => COMPLETED_STATUSES.includes(b.status))
      .filter(b => !b.reviewRequestedAt)
      .sort((a, b) => {
        const da = a.pickupDate || a.deliveryDate || '';
        const db = b.pickupDate || b.deliveryDate || '';
        return db.localeCompare(da); // newest first
      });
  }, [bookings]);

  const done = useMemo(() => {
    return bookings
      .filter(b => COMPLETED_STATUSES.includes(b.status))
      .filter(b => b.reviewRequestedAt)
      .sort((a, b) => (b.reviewRequestedAt || '').localeCompare(a.reviewRequestedAt || ''))
      .slice(0, 20);
  }, [bookings]);

  const handleShare = async (booking) => {
    // Opens native share sheet — user picks Messages (or any app)
    try {
      await Share.share({
        message: REVIEW_MESSAGE,
      });
    } catch (e) {
      Alert.alert('Could not open share sheet', String(e?.message || e));
    }
  };

  const handleSms = async (booking) => {
    const num = formatPhoneForSms(booking.phone);
    if (!num) {
      Alert.alert('No phone number', 'This booking has no phone number saved.');
      return;
    }
    // iOS uses & separator, Android uses ?
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${num}${separator}body=${encodeURIComponent(REVIEW_MESSAGE)}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Could not open Messages', 'Try the Share button instead.');
    }
  };

  const handleMarkSent = (booking) => {
    Alert.alert(
      'Mark as sent',
      `Remove ${booking.customerName} from the pending reviews list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark sent',
          style: 'default',
          onPress: () => {
            dispatch({
              type: 'MARK_REVIEW_REQUESTED',
              payload: { id: booking.id, timestamp: new Date().toISOString() },
            });
          },
        },
      ]
    );
  };

  const handleUnmark = (booking) => {
    Alert.alert(
      'Move back to pending',
      `Add ${booking.customerName} back to the pending list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move back',
          onPress: () => {
            dispatch({
              type: 'MARK_REVIEW_REQUESTED',
              payload: { id: booking.id, timestamp: null },
            });
          },
        },
      ]
    );
  };

  const handleBulkDate = (isoDate) => {
    setShowBulkCal(false);
    const count = pending.filter(b => (b.deliveryDate || '') <= isoDate).length;
    if (count === 0) {
      Alert.alert('Nothing to update', `No pending bookings with delivery date on or before ${formatDate(isoDate)}.`);
      return;
    }
    Alert.alert(
      'Mark all as sent?',
      `This will mark ${count} booking${count === 1 ? '' : 's'} delivered on or before ${formatDate(isoDate)} as already requested.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Mark ${count}`,
          style: 'default',
          onPress: () => {
            dispatch({
              type: 'BULK_MARK_REVIEWS_BEFORE',
              payload: { isoDate },
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Pending Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Summary */}
        <View style={s.summaryCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.summaryLabel}>To ask for review</Text>
            <Text style={s.summaryBig}>{pending.length}</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={{ flex: 1 }}>
            <Text style={s.summaryLabel}>Already asked</Text>
            <Text style={[s.summaryBig, { color: C.tertiary }]}>{done.length}</Text>
          </View>
        </View>

        {/* Bulk action */}
        <TouchableOpacity
          style={s.bulkBtn}
          onPress={() => setShowBulkCal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="layers-outline" size={16} color={C.onSurfaceVariant} />
          <Text style={s.bulkBtnText}>Mark all delivered before a date</Text>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>

        {/* Pending list */}
        {pending.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={C.success} />
            <Text style={s.emptyTitle}>All caught up!</Text>
            <Text style={s.emptySub}>Every delivered customer has been asked for a review.</Text>
          </View>
        ) : (
          <View style={{ marginTop: 4 }}>
            <Text style={s.sectionLabel}>PENDING · {pending.length}</Text>
            {pending.map(b => (
              <View key={b.id} style={s.card}>
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.custName}>{b.customerName || 'Unnamed'}</Text>
                    <Text style={s.custMeta}>
                      {b.phone || 'No phone'} · {b.serviceType || '—'}
                    </Text>
                    <Text style={s.custDate}>
                      Delivered {formatDate(b.deliveryDate)}
                      {b.pickupDate ? ` · Pickup ${formatDate(b.pickupDate)}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={s.actions}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleSms(b)} activeOpacity={0.8}>
                    <Ionicons name="chatbubble-outline" size={16} color={C.onSurface} />
                    <Text style={s.actionTxt}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleShare(b)} activeOpacity={0.8}>
                    <Ionicons name="share-outline" size={16} color={C.onSurface} />
                    <Text style={s.actionTxt}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, s.actionPrimary]}
                    onPress={() => handleMarkSent(b)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark" size={16} color={C.onPrimary} />
                    <Text style={[s.actionTxt, { color: C.onPrimary }]}>Sent</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recently marked */}
        {done.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={s.sectionLabel}>RECENTLY MARKED · TAP TO UNDO</Text>
            {done.map(b => (
              <TouchableOpacity
                key={b.id}
                style={s.doneRow}
                onPress={() => handleUnmark(b)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={18} color={C.tertiary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.doneName}>{b.customerName || 'Unnamed'}</Text>
                  <Text style={s.doneMeta}>{formatDate(b.deliveryDate)}</Text>
                </View>
                <Ionicons name="arrow-undo-outline" size={16} color={C.muted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bulk date picker modal */}
      <Modal visible={showBulkCal} transparent animationType="fade">
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowBulkCal(false)}
        >
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Mark delivered on or before…</Text>
              <TouchableOpacity onPress={() => setShowBulkCal(false)}>
                <Ionicons name="close" size={24} color={C.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <Calendar
              theme={{
                selectedDayBackgroundColor: C.primaryContainer,
                todayTextColor: C.primaryContainer,
                arrowColor: C.primaryContainer,
              }}
              onDayPress={(day) => handleBulkDate(day.dateString)}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceHigh,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: C.onSurface,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: C.surfaceLow,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: C.surfaceHigh,
    marginHorizontal: 16,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.onSurfaceVariant,
    marginBottom: 6,
  },
  summaryBig: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    color: C.primary,
  },

  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceLow,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 20,
  },
  bulkBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: C.onSurface,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: C.onSurfaceVariant,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: C.surfaceLow,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardHead: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  custName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: -0.2,
  },
  custMeta: {
    fontSize: 12,
    color: C.onSurfaceVariant,
    marginTop: 3,
  },
  custDate: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceHigh,
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  actionPrimary: {
    backgroundColor: C.primary,
  },
  actionTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: C.onSurface,
    letterSpacing: 0.2,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.onSurface,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: C.onSurfaceVariant,
    marginTop: 6,
    textAlign: 'center',
  },

  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: C.surfaceLow,
    borderRadius: 10,
    marginBottom: 6,
  },
  doneName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.onSurface,
  },
  doneMeta: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 420,
  },
  modalHead: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceHigh,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.onSurface,
  },
});
