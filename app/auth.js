import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';

const C = {
  bg: '#FFFFFF',
  surface: '#F7F7F7',
  border: '#E8E8E8',
  primary: '#ffb77d',
  primaryDark: '#ff8c00',
  text: '#1A1A1A',
  textMuted: '#666666',
  textLight: '#999999',
  danger: '#FF3D00',
};

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          scopes: 'openid email profile https://www.googleapis.com/auth/calendar',
        },
      });
      if (error) {
        Alert.alert('Google Sign-In', error.message || 'Could not start Google sign-in. Please try again.');
        setLoading(false);
      }
      // RouteGuard handles navigation after auth state changes
    } catch (e) {
      Alert.alert('Unexpected error', e.message || 'Try again');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logo}>
          <Ionicons name="cube" size={56} color={C.primaryDark} />
          <Text style={styles.brand}>Dumpsterin</Text>
          <Text style={styles.tagline}>The operating system for dumpster rentals</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.subheading}>
            Use your Google account to sign in or create a new business in seconds.
          </Text>

          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.googleBtnDisabled]}
            onPress={handleGoogle}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={22} color="#4285F4" />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            By continuing, you agree to share your name and email with Dumpsterin so we can set up your account. Calendar access is requested so your bookings sync automatically.
          </Text>

          <View style={styles.steps}>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
              <Text style={styles.stepText}>Sign in with Google</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
              <Text style={styles.stepText}>Set up your business (≈5 min)</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
              <Text style={styles.stepText}>Start receiving and managing bookings</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Need help? Email{' '}
          <Text style={styles.footerLink}>support@dumpsterin.com</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, padding: 24, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { alignItems: 'center', marginBottom: 32 },
  brand: { fontSize: 32, fontWeight: '700', color: C.text, marginTop: 12, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: C.textMuted, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 28, gap: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  subheading: { fontSize: 14, color: C.textMuted, lineHeight: 20 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginTop: 4,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleText: { color: C.text, fontWeight: '600', fontSize: 16 },
  hint: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  steps: { marginTop: 12, gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: 'white', fontWeight: '700', fontSize: 13 },
  stepText: { color: C.text, fontSize: 14 },
  footer: { textAlign: 'center', color: C.textMuted, fontSize: 13, marginTop: 24 },
  footerLink: { color: C.primaryDark, fontWeight: '500' },
});
