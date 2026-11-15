import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api';
import type { SavedAddress } from '@/api/types';
import { Button } from '@/components/Button';
import { ClosedBanner } from '@/components/ClosedBanner';
import { Banner, EmptyView, ErrorView, Loading } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useAddresses, useProfile } from '@/hooks/queries';
import { useCartView } from '@/hooks/useCartView';
import { formatINR, newIdempotencyKey, round2 } from '@/lib/format';
import { api } from '@/lib/supabase';
import { isValidPhone, isValidPin, normalizePhone } from '@/lib/validation';
import { useAuth } from '@/store/auth';
import { useCart } from '@/store/cart';
import { colors, radius, shadow } from '@/theme';

interface Form {
  name: string;
  phone: string;
  house: string;
  street: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  instructions: string;
}
const EMPTY: Form = { name: '', phone: '', house: '', street: '', landmark: '', city: '', state: '', pincode: '', instructions: '' };

export default function Checkout() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const clearCart = useCart((s) => s.clear);

  const v = useCartView();
  const profile = useProfile(userId);
  const addresses = useAddresses();

  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saveAddress, setSaveAddress] = useState(true);
  const prefilled = useRef(false);
  const keyRef = useRef(newIdempotencyKey());

  // Pre-fill from the most recent saved address, or from the profile.
  useEffect(() => {
    if (prefilled.current || profile.isLoading || addresses.isLoading) return;
    prefilled.current = true;
    const a = addresses.data?.[0];
    if (a) fillFrom(a);
    else setForm((f) => ({ ...f, name: profile.data?.full_name ?? '', phone: profile.data?.phone ?? '' }));
  }, [profile.isLoading, addresses.isLoading, profile.data, addresses.data]);

  const fillFrom = (a: SavedAddress) =>
    setForm({
      name: a.recipient_name,
      phone: a.phone,
      house: a.house_no,
      street: a.street_locality,
      landmark: a.landmark ?? '',
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      instructions: '',
    });

  const set = (k: keyof Form) => (t: string) => {
    setForm((f) => ({ ...f, [k]: t }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your name';
    if (!isValidPhone(normalizePhone(form.phone))) e.phone = 'Enter a valid 10-digit mobile number';
    if (!form.house.trim()) e.house = 'Required';
    if (!form.street.trim()) e.street = 'Required';
    if (!form.city.trim()) e.city = 'Required';
    if (!form.state.trim()) e.state = 'Required';
    const pin = form.pincode.trim();
    const allowed = v.settings?.serviceable_pincodes ?? [];
    if (!isValidPin(pin)) e.pincode = 'Enter a valid 6-digit PIN code';
    else if (allowed.length > 0 && !allowed.includes(pin)) e.pincode = "Sorry, we don't deliver to this PIN code yet";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const place = useMutation({
    mutationFn: () =>
      api.placeOrder({
        restaurantId: v.restaurant!.id,
        items: v.rows.map((r) => ({ product_id: r.productId, quantity: r.quantity })),
        customerName: form.name.trim(),
        customerPhone: normalizePhone(form.phone),
        houseNo: form.house.trim(),
        streetLocality: form.street.trim(),
        landmark: form.landmark.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        instructions: form.instructions.trim(),
        idempotencyKey: keyRef.current,
      }),
    onSuccess: (res) => {
      router.replace(`/order/${res.order_id}?placed=1`);
      clearCart();
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (saveAddress && userId) {
        api
          .saveAddress(userId, {
            recipient_name: form.name.trim(),
            phone: normalizePhone(form.phone),
            house_no: form.house.trim(),
            street_locality: form.street.trim(),
            landmark: form.landmark.trim() || null,
            city: form.city.trim(),
            state: form.state.trim(),
            pincode: form.pincode.trim(),
          })
          .then(() => qc.invalidateQueries({ queryKey: ['addresses'] }))
          .catch(() => {});
      }
    },
    onError: (e: Error) => {
      // The server refused the order (nothing was created): a retry needs a fresh key.
      // For a network failure we keep the key, so a retry cannot create a duplicate order.
      if (e instanceof ApiError && e.fromServer) keyRef.current = newIdempotencyKey();
      Alert.alert('Could not place order', e.message);
    },
  });

  const onPlace = () => {
    if (!v.canCheckout) return;
    if (!validate()) {
      Alert.alert('Please check your details', 'Some fields need your attention.');
      return;
    }
    Alert.alert('Place order?', `You will pay ${formatINR(v.total)} in cash on delivery.`, [
      { text: 'Review', style: 'cancel' },
      { text: 'Place order', onPress: () => place.mutate() },
    ]);
  };

  if (v.rows.length === 0 && !place.isPending && !place.isSuccess) {
    return <EmptyView icon="cart-outline" title="Your cart is empty" actionTitle="Browse menu" onAction={() => router.replace('/menu')} />;
  }
  if (v.checkError) return <ErrorView message={v.checkError.message} onRetry={() => v.retryCheck()} />;
  if (!v.ready || profile.isLoading || addresses.isLoading) return <Loading />;

  const saved = addresses.data ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <ClosedBanner />
        {v.hasUnavailable ? <Banner kind="danger" text="Some items in your cart are no longer available. Go back to the cart to remove them." /> : null}
        {v.belowMin ? <Banner kind="warning" text={`Minimum order is ${formatINR(v.minOrder)}. Add ${formatINR(v.shortBy)} more.`} /> : null}

        <Text style={styles.section}>Delivery details</Text>

        {saved.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {saved.map((a) => (
              <Pressable key={a.id} onPress={() => fillFrom(a)} style={styles.savedChip}>
                <Text style={styles.savedText} numberOfLines={1}>
                  {a.house_no}, {a.street_locality}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <TextField label="Full name" value={form.name} onChangeText={set('name')} error={errors.name} autoComplete="name" />
        <TextField label="Mobile number" value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" maxLength={14} />
        <TextField label="House / flat number" value={form.house} onChangeText={set('house')} error={errors.house} />
        <TextField label="Street and locality" value={form.street} onChangeText={set('street')} error={errors.street} />
        <TextField label="Landmark" optional value={form.landmark} onChangeText={set('landmark')} />
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <TextField label="City" value={form.city} onChangeText={set('city')} error={errors.city} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="State" value={form.state} onChangeText={set('state')} error={errors.state} />
          </View>
        </View>
        <TextField label="PIN code" value={form.pincode} onChangeText={set('pincode')} error={errors.pincode} keyboardType="number-pad" maxLength={6} />
        <TextField
          label="Delivery instructions"
          optional
          value={form.instructions}
          onChangeText={set('instructions')}
          multiline
          maxLength={500}
          placeholder="e.g. Ring the bell twice, less spicy"
        />
        <View style={styles.saveRow}>
          <Text style={styles.saveText}>Save this address for next time</Text>
          <Switch value={saveAddress} onValueChange={setSaveAddress} trackColor={{ true: colors.primary }} />
        </View>

        <Text style={styles.section}>Order summary</Text>
        <View style={styles.card}>
          {v.rows.map((r) => (
            <View key={r.productId} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={2}>
                {r.quantity} × {r.name}
              </Text>
              <Text style={styles.itemPrice}>{formatINR(round2(r.price * r.quantity))}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Line label="Subtotal" value={formatINR(v.subtotal)} />
          <Line label="Delivery charges" value={v.deliveryFee > 0 ? formatINR(v.deliveryFee) : 'Free'} />
          <View style={styles.divider} />
          <Line label="Total payable" value={formatINR(v.total)} bold />
          <Text style={styles.cod}>Payment method: Cash on delivery</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={`Place order · ${formatINR(v.total)}`}
          onPress={onPlace}
          loading={place.isPending}
          disabled={!v.canCheckout}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.itemRow}>
      <Text style={[styles.lineLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 16, marginBottom: 12 },
  twoCol: { flexDirection: 'row', gap: 12 },
  savedChip: { maxWidth: 240, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  savedText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  saveText: { fontSize: 15, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, ...shadow },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4, gap: 12 },
  itemName: { flex: 1, fontSize: 15, color: colors.text },
  itemPrice: { fontSize: 15, fontWeight: '600', color: colors.text },
  lineLabel: { fontSize: 15, color: colors.muted },
  lineValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  bold: { fontSize: 17, fontWeight: '800', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  cod: { marginTop: 8, fontSize: 12.5, color: colors.muted },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
});
