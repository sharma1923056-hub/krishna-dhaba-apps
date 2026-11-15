import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/Button';
import { Banner } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { authMessage, EMAIL_RE, isValidPhone, normalizePhone } from '@/lib/validation';
import { colors } from '@/theme';

export default function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    const e = email.trim().toLowerCase();
    const p = normalizePhone(phone);
    if (name.trim().length < 2) return setError('Please enter your full name.');
    if (!isValidPhone(p)) return setError('Please enter a valid 10-digit mobile number.');
    if (!EMAIL_RE.test(e)) return setError('Please enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setError('');
    setInfo('');
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: e,
      password,
      options: { data: { full_name: name.trim(), phone: p } },
    });
    setLoading(false);
    if (err) return setError(authMessage(err.message));
    if (!data.session) {
      setInfo('Account created. Please confirm your email address, then sign in.');
    }
    // When a session is returned the app moves to the home screen automatically.
  };

  return (
    <AuthShell title="Create your account" subtitle="It takes less than a minute">
      <TextField label="Full name" value={name} onChangeText={setName} autoComplete="name" placeholder="Your name" />
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="10-digit mobile number"
        maxLength={14}
      />
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
        autoComplete="new-password"
        placeholder="At least 8 characters"
        onSubmitEditing={submit}
      />
      {error ? <Banner kind="danger" text={error} /> : null}
      {info ? <Banner kind="success" text={info} /> : null}
      <Button title="Create account" onPress={submit} loading={loading} style={{ marginTop: 16 }} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" style={styles.link}>
          Sign in
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
