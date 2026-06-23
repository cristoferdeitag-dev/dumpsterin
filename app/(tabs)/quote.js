// Quote tab — the visible entry point into the quote/booking builder.
// The builder itself lives at /booking/create (pushed screen so its header
// back button works). This launcher makes "create a quote" easy to find and
// explains the branded-link flow.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#FFFFFF',
  card: '#F7F7F7',
  border: '#E8E8E8',
  text: '#1A1A1A',
  textMuted: '#666666',
  primary: '#FFCD11',
  accent: '#14213D',
};

function Step({ icon, title, desc }) {
  return (
    <View style={s.step}>
      <View style={s.stepIcon}>
        <Ionicons name={icon} size={18} color={C.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

export default function QuoteTab() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Quotes</Text>
        <Text style={s.sub}>
          Build a quote with your own prices and send the customer a branded link to accept the
          terms and pay by card.
        </Text>

        <View style={s.card}>
          <Step icon="person" title="Pick the customer" desc="Search your CRM or add a new one." />
          <Step icon="cube" title="Add dumpster + extras" desc="Prices come from Settings → Pricing." />
          <Step icon="link" title="Create the quote link" desc="A branded page on your domain — they accept & pay." />
        </View>

        <TouchableOpacity style={s.cta} onPress={() => router.push('/booking/create')} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={22} color={C.accent} />
          <Text style={s.ctaText}>Create Quote</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondary} onPress={() => router.push('/settings')} activeOpacity={0.8}>
          <Ionicons name="pricetags-outline" size={18} color={C.text} />
          <Text style={s.secondaryText}>Edit my prices</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 28 },
  h1: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 14,
    marginBottom: 22,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.primary + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  stepDesc: { fontSize: 12.5, color: C.textMuted, marginTop: 2 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.primary,
    minHeight: 54, borderRadius: 14,
  },
  ctaText: { fontSize: 16, fontWeight: '800', color: C.accent },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, borderRadius: 12, marginTop: 12,
    borderWidth: 1.5, borderColor: C.border,
  },
  secondaryText: { fontSize: 14, fontWeight: '700', color: C.text },
});
