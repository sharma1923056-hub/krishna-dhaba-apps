import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAccess } from '@/store';
import { configured } from '@/lib/supabase';
import { C } from '@/components/ui';

export default function Index() {
  const { session, loading, restaurantId } = useAccess();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.orange} /></View>;
  if (!configured) return <Redirect href="/(auth)/login" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!restaurantId) return <Redirect href="/(auth)/unauthorized" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
