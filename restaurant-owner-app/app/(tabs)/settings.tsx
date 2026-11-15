import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useAccess } from '@/store';
import { supabase } from '@/lib/supabase';
import { Action, Busy, C, Card, ErrorText, Field, Heading, Screen } from '@/components/ui';

export default function Settings() {
  const { restaurantId, role, restaurantName } = useAccess();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(true);
  const [opening, setOpening] = useState('10:00');
  const [closing, setClosing] = useState('23:00');
  const [fee, setFee] = useState('0');
  const [minimum, setMinimum] = useState('0');
  const [pincodes, setPincodes] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [name, setName] = useState(restaurantName);
  const owner = role === 'owner';
  const load = useCallback(async () => {
    if (!restaurantId) return;
    const [{ data: s, error: se }, { data: r, error: re }] = await Promise.all([
      supabase.from('restaurant_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      supabase.from('restaurants').select('name,phone,address').eq('id', restaurantId).maybeSingle()
    ]);
    if (se || re) Alert.alert('Settings could not load', (se ?? re)?.message ?? 'Unknown error');
    if (s) {
      setAccepting(s.is_accepting_orders); setOpening(String(s.opening_time).slice(0,5));
      setClosing(String(s.closing_time).slice(0,5)); setFee(String(s.delivery_fee));
      setMinimum(String(s.min_order_amount)); setPincodes((s.serviceable_pincodes ?? []).join(', '));
    }
    if (r) { setName(r.name); setPhone(r.phone ?? ''); setAddress(r.address ?? ''); }
    setLoading(false);
  }, [restaurantId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const save = async () => {
    const feeNum = Number(fee), minNum = Number(minimum);
    if (!Number.isFinite(feeNum) || feeNum < 0 || !Number.isFinite(minNum) || minNum < 0) {
      Alert.alert('Invalid amount', 'Delivery fee and minimum order amount must be zero or more.'); return;
    }
    const pinArray = pincodes.split(',').map(x => x.trim()).filter(Boolean);
    if (pinArray.some(x => !/^[1-9][0-9]{5}$/.test(x))) {
      Alert.alert('Invalid PIN code', 'Enter six-digit PIN codes separated by commas.'); return;
    }
    const { error: settingsError } = await supabase.from('restaurant_settings').update({
      is_accepting_orders: accepting, opening_time: opening, closing_time: closing,
      delivery_fee: feeNum, min_order_amount: minNum, serviceable_pincodes: pinArray
    }).eq('restaurant_id', restaurantId!);
    if (settingsError) { Alert.alert('Settings not saved', settingsError.message); return; }
    const { error: restaurantError } = await supabase.from('restaurants').update({ name, phone: phone || null, address: address || null }).eq('id', restaurantId!);
    if (restaurantError) Alert.alert('Restaurant details not saved', restaurantError.message);
    else Alert.alert('Saved', 'Restaurant settings updated. Customer app will receive the changes.');
  };
  if (loading) return <Screen><Busy /></Screen>;
  return <Screen>
    <Heading title="Restaurant settings" subtitle="Changes here affect the Customer App." />
    {!owner && <Card><ErrorText>Owner access required. Staff accounts can view this page but cannot save owner-level settings.</ErrorText></Card>}
    <Card>
      <Text style={{ color: C.ink, fontWeight: '900', marginBottom: 12 }}>Ordering</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: C.ink }}>Accept new orders</Text>
        <Switch value={accepting} onValueChange={setAccepting} disabled={!owner} trackColor={{ true: C.green }} />
      </View>
      <Field label="OPENING TIME (24-HOUR HH:MM)" value={opening} onChangeText={setOpening} editable={owner} placeholder="10:00" />
      <Field label="CLOSING TIME (24-HOUR HH:MM)" value={closing} onChangeText={setClosing} editable={owner} placeholder="23:00" />
    </Card>
    <Card>
      <Text style={{ color: C.ink, fontWeight: '900', marginBottom: 12 }}>Delivery</Text>
      <Field label="DELIVERY FEE (₹)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" editable={owner} />
      <Field label="MINIMUM ORDER (₹)" value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" editable={owner} />
      <Field label="SERVICEABLE PIN CODES (COMMA SEPARATED; EMPTY = ALL)" value={pincodes} onChangeText={setPincodes} editable={owner} placeholder="110001, 110002" />
    </Card>
    <Card>
      <Text style={{ color: C.ink, fontWeight: '900', marginBottom: 12 }}>Customer-facing restaurant details</Text>
      <Field label="RESTAURANT NAME" value={name} onChangeText={setName} editable={owner} />
      <Field label="PHONE" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={owner} />
      <Field label="ADDRESS" value={address} onChangeText={setAddress} editable={owner} multiline />
    </Card>
    {owner && <Action title="Save settings" onPress={() => void save()} />}
    <Action title="Sign out" secondary onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/login'); }} />
  </Screen>;
}
