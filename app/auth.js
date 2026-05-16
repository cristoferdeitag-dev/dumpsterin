import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  StyleSheet, ActivityIndicator, Alert, TextInput,
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
  success: '#16A34A',
};

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleMagicLink = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Email required', 'Please enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : 'https://dumpsterin.com';
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        Alert.alert('Could not send link', error.message || 'Try again in a moment.');
        setSending(false);
        return;
      }
      setSent(true);
    } catch (e) {
      Alert.alert('Unexpected error', e.message || 'Try again');
    } finally {
      setSending(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          scopes: 'openid email profile https://www.googleapis.com/auth/calendar',
        },
      });
      if (error) {
        Alert.alert('Google Sign-In unavailable', 'Google sign-in is being configured. For now please use the email magic link below.');
        setGoogleLoading(false);
      }
    } catch (e) {
      Alert.alert('Unexpected error', e.message || 'Try again');
      setGoogleLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.logo}>
            <Ionicons name="mail-open" size={56} color={C.primaryDark} />
            <Text style={styles.brand}>Check your email</Text>
            <Text style={styles.tagline}>
              We sent a sign-in link to {email}. Click the link to enter Dumpsterin.
            </Text>
          </View>
          <TouchableOpacity onPress={() => { setSent(false); setEmail(''); }} style={styles.linkRow}>
            <Text style={styles.linkText}>Use a different email</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
            Enter your email and we'll send you a one-tap sign-in link.
          </Text>

          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={20} color={C.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={C.textLight}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!sending}
              onSubmitEditing={handleMagicLink}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, (sending || !email) && styles.primaryBtnDisabled]}
            onPress={handleMagicLink}
            disabled={sending || !email}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Send magic link</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#4285F4" />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            New here? Sign in with your email and we'll set up your account on the next screen.
          </Text>
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
  logo: { alignItems: 'center', marginBottom: 28 },
  brand: { fontSize: 30, fontWeight: '700', color: C.text, marginTop: 12, letterSpacing: -0.5, textAlign: 'center' },
  tagline: { fontSize: 14, color: C.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 24, gap: 14 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text },
  subheading: { fontSize: 14, color: C.textMuted, lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 4,
  },
  input: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: 12, backgroundColor: C.primaryDark,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, color: C.textLight, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 13, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: 'white',
  },
  googleBtnDisabled: { opacity: 0.5 },
  googleText: { color: C.text, fontWeight: '600', fontSize: 15 },
  hint: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center' },
  footer: { textAlign: 'center', color: C.textMuted, fontSize: 13, marginTop: 22 },
  footerLink: { color: C.primaryDark, fontWeight: '500' },
  linkRow: { alignItems: 'center', marginTop: 18 },
  linkText: { color: C.primaryDark, fontWeight: '600', fontSize: 14 },
});
