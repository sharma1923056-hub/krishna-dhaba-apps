import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase, configured } from '@/lib/supabase';
import { useAccess } from '@/store';
import { Action, Card, C, ErrorText, Field, Screen } from '@/components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { refreshAccess } = useAccess();

  const signIn = async () => {
    setError('');
    if (!configured) { setError('Supabase settings are missing from this build.'); return; }
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setError(authError.message); setBusy(false); return; }
    await refreshAccess();
    const { data: auth } = await supabase.auth.getSession();
    const { data: restaurant } = await supabase.from('restaurants').select('id').eq('slug', process.env.EXPO_PUBLIC_RESTAURANT_SLUG ?? 'krishna-dhaba').maybeSingle();
    const { data: membership } = restaurant && auth.session
      ? await supabase.from('restaurant_staff').select('role').eq('restaurant_id', restaurant.id).eq('user_id', auth.session.user.id).maybeSingle()
      : { data: null };
    setBusy(false);
    if (!membership) {
      await supabase.auth.signOut();
      setError('This login is not assigned as an owner or staff member for Krishna Dhaba. Ask the administrator to assign your account.');
      return;
    }
    router.replace('/(tabs)/dashboard');
  };

  return <Screen>
    <View style={{ paddingTop: 48, paddingBottom: 25 }}>
      <Text style={{ color: C.orange, fontWeight: '900', letterSpacing: 2 }}>KRISHNA DHABA</Text>
      <Text style={{ fontSize: 31, fontWeight: '900', color: C.ink, marginTop: 12 }}>Owner Portal</Text>
      <Text style={{ color: C.muted, marginTop: 8 }}>Manage orders, menu and restaurant settings.</Text>
    </View>
    <Card>
      <Field label="OWNER / STAFF EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
      <Field label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" />
      {!!error && <ErrorText>{error}</ErrorText>}
      <Action title={busy ? 'Signing in…' : 'Sign in securely'} onPress={signIn} disabled={busy} />
    </Card>
    <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>Only accounts assigned in restaurant_staff can access this app.</Text>
  </Screen>;
}
