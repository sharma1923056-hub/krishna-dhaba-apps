import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/Button';
import { Banner } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { authMessage, EMAIL_RE } from '@/lib/validation';
import { colors } from '@/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return setError('Please enter a valid email address.');
    if (!password) return setError('Please enter your password.');
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: e, password });
    setLoading(false);
    if (err) setError(authMessage(err.message));
    // On success the app switches to the home screen automatically.
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to order your favourite food">
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        placeholder="Your password"
        onSubmitEditing={submit}
      />
      {error ? <Banner kind="danger" text={error} /> : null}
      <Button title="Sign in" onPress={submit} loading={loading} style={{ marginTop: 16 }} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>New here? </Text>
        <Link href="/register" style={styles.link}>
          Create an account
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: colors.muted, fontSize: 15 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});
