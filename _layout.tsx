import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Loading } from '@/components/StateViews';
import { useRestaurant } from '@/hooks/queries';
import { RealtimeSync } from '@/hooks/realtime';
import { IS_CONFIGURED } from '@/lib/config';
import { AuthProvider, useAuth } from '@/store/auth';
import { colors } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

// When the app returns to the foreground, refresh anything that is out of date.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
  return () => sub.remove();
});

function LiveUpdates({ userId }: { userId: string }) {
  const { data } = useRestaurant();
  return <RealtimeSync userId={userId} restaurantId={data?.id} />;
}

function Gate() {
  const { session, loading } = useAuth();

  if (!IS_CONFIGURED) {
    return (
      <View style={styles.config}>
        <Text style={styles.configTitle}>App not configured</Text>
        <Text style={styles.configText}>
          This build is missing its Supabase connection settings (EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY). Please rebuild after adding them.
        </Text>
      </View>
    );
  }
  if (loading) return <Loading />;

  return (
    <>
      <StatusBar style="light" />
      {session ? <LiveUpdates userId={session.user.id} /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Item details' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order details' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  config: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg },
  configTitle: { fontSize: 20, fontWeight: '800', color: colors.danger, marginBottom: 8 },
  configText: { fontSize: 14, color: colors.text, textAlign: 'center' },
});
