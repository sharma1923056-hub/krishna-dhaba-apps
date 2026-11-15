import React from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Action, C, Screen } from '@/components/ui';

export default function Unauthorized() {
  return <Screen>
    <Text style={{ fontSize: 25, fontWeight: '800', color: C.ink, marginTop: 50 }}>Access not assigned</Text>
    <Text style={{ color: C.muted, marginVertical: 14 }}>This account is signed in, but it has no owner or staff membership for Krishna Dhaba. Add it to restaurant_staff using the approved Supabase owner setup process.</Text>
    <Action title="Sign out" onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/login'); }} />
  </Screen>;
}
