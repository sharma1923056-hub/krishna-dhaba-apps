import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Loading } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useAddresses, useProfile } from '@/hooks/queries';
import { api, supabase } from '@/lib/supabase';
import { isValidPhone, normalizePhone } from '@/lib/validation';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { colors, radius, shadow } from '@/theme';

export default function Account() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const profile = useProfile(userId);
  const addresses = useAddresses();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && profile.data) {
      setName(profile.data.full_name ?? '');
      setPhone(profile.data.phone ?? '');
      setLoaded(true);
    }
  }, [profile.data, loaded]);

  if (profile.isLoading) return <Loading />;

  const changed = name.trim() !== (profile.data?.full_name ?? '') || normalizePhone(phone) !== (profile.data?.phone ?? '');

  const save = async () => {
    const p = normalizePhone(phone);
    if (name.trim().length < 2) return Alert.alert('Please enter your name');
    if (!isValidPhone(p)) return Alert.alert('Please enter a valid 10-digit mobile number');
    setSaving(true);
    try {
      await api.updateProfile(userId!, { full_name: name.trim(), phone: p });
      await qc.invalidateQueries({ queryKey: ['profile'] });
      setPhone(p);
      Alert.alert('Saved', 'Your details were updated.');
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeAddress = (id: string) =>
    Alert.alert('Delete this address?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAddress(id);
            qc.invalidateQueries({ queryKey: ['addresses'] });
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          }
        },
      },
    ]);

  const signOut = () =>
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          useCart.getState().clear();
          await supabase.auth.signOut();
          qc.clear();
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.title}>My details</Text>
        <Text style={styles.email}>{session?.user.email}</Text>
        <TextField label="Full name" value={name} onChangeText={setName} />
        <TextField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={14} />
        <Button title="Save changes" onPress={save} loading={saving} disabled={!changed} />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Saved addresses</Text>
        {(addresses.data ?? []).length === 0 ? (
          <Text style={styles.muted}>No saved addresses yet. You can save one while checking out.</Text>
        ) : (
          (addresses.data ?? []).map((a) => (
            <View key={a.id} style={styles.addrRow}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <Text style={styles.addrText}>
                {a.house_no}, {a.street_locality}, {a.city}, {a.state} - {a.pincode}
              </Text>
              <Pressable onPress={() => removeAddress(a.id)} hitSlop={8} accessibilityLabel="Delete address">
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Button title="Sign out" variant="outline" onPress={signOut} />
      <Text style={styles.version}>Krishna Dhaba · version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, ...shadow },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  email: { fontSize: 14, color: colors.muted, marginBottom: 14 },
  muted: { fontSize: 14, color: colors.muted },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  addrText: { flex: 1, fontSize: 14, color: colors.text },
  version: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 4 },
});
