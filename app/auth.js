import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

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
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  const submit = async () => {
    if (!email || !password) {
      Alert.alert('Campos requeridos', 'Ingresa tu email y contraseña');
      return;
    }
    if (!isLogin && password.length < 8) {
      Alert.alert('Contraseña muy corta', 'Debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn({ email, password });
        if (error) {
          Alert.alert('Error al iniciar sesión', error.message);
        } else {
          router.replace('/(tabs)');
        }
      } else {
        const { user, error } = await signUp({ email, password, fullName });
        if (error) {
          Alert.alert('Error al crear cuenta', error.message);
        } else if (user) {
          // After signup, redirect to onboarding to create their company
          router.replace('/onboarding');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          <View style={styles.logo}>
            <Ionicons name="cube" size={48} color={C.primaryDark} />
            <Text style={styles.brand}>Dumpsterin</Text>
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, isLogin && styles.tabActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Iniciar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, !isLogin && styles.tabActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View>
                <Text style={styles.label}>Tu nombre</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Ej: Asaí López"
                  placeholderTextColor={C.textLight}
                  autoCapitalize="words"
                />
              </View>
            )}
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="tu@email.com"
                placeholderTextColor={C.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
            <View>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={isLogin ? 'Tu contraseña' : 'Mínimo 8 caracteres'}
                placeholderTextColor={C.textLight}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={styles.submitText}>{isLogin ? 'Entrar' : 'Crear cuenta'}</Text>
                  <Ionicons name="arrow-forward" size={18} color="white" />
                </>
              )}
            </TouchableOpacity>

            {!isLogin && (
              <Text style={styles.hint}>
                Después de crear tu cuenta te pedirá que configures tu empresa (toma ~5 minutos).
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  logo: { alignItems: 'center', marginBottom: 40 },
  brand: { fontSize: 28, fontWeight: '700', color: C.text, marginTop: 8 },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, padding: 4, marginBottom: 24 },
  tab: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { color: C.textMuted, fontWeight: '500' },
  tabTextActive: { color: C.text, fontWeight: '600' },
  form: { gap: 14 },
  label: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, fontSize: 15, backgroundColor: 'white', color: C.text },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primaryDark, padding: 16, borderRadius: 10, marginTop: 10 },
  submitText: { color: 'white', fontWeight: '600', fontSize: 16 },
  hint: { color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 },
});
