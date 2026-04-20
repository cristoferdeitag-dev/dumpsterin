import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { AppProvider } from '../src/context/AppContext';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/colors';

function RouteGuard({ children }) {
  const { isAuthenticated, hasCompany, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const first = segments[0];
    const inAuth = first === 'auth';
    const inOnboarding = first === 'onboarding';

    if (!isAuthenticated && !inAuth) {
      router.replace('/auth');
    } else if (isAuthenticated && !hasCompany && !inOnboarding && !inAuth) {
      // Logged in but no company yet → send to onboarding
      router.replace('/onboarding');
    } else if (isAuthenticated && hasCompany && inAuth) {
      // Already logged in, trying to access auth page → redirect to home
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, hasCompany, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color="#ff8c00" />
      </View>
    );
  }
  return children;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppProvider>
        <StatusBar style="light" />
        <RouteGuard>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth" options={{ presentation: 'card' }} />
            <Stack.Screen name="onboarding" options={{ presentation: 'card' }} />
            <Stack.Screen name="booking/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="booking/create" options={{ presentation: 'card' }} />
            <Stack.Screen name="booking/edit" options={{ presentation: 'card' }} />
            <Stack.Screen name="driver" options={{ presentation: 'card' }} />
            <Stack.Screen name="revenue" options={{ presentation: 'card' }} />
          </Stack>
        </RouteGuard>
      </AppProvider>
    </AuthProvider>
  );
}
