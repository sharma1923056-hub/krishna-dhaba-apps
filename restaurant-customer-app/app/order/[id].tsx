import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { OrderStatus } from '@/api/types';
import { Button } from '@/components/Button';
import { Banner, EmptyView, ErrorView, Loading } from '@/components/StateViews';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrder, useRestaurant } from '@/hooks/queries';
import { formatDateTime, formatINR, STATUS_FLOW, STATUS_META } from '@/lib/format';
import { api } from '@/lib/supabase';
import { colors, radius, shadow } from '@/theme';

export default function OrderDetailScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const { data: order, isLoading, error, refetch } = useOrder(id);
  const { data: restaurant } = useRestaurant();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const cancel = useMutation({
    mutationFn: () => api.cancelOrder(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => {
      Alert.alert('Could not cancel', e.message);
      qc.invalidateQueries({ queryKey: ['order', id] }); // the status may have just changed
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorView message={(error as Error).message} onRetry={refetch} />;
  if (!order) return <EmptyView icon="receipt-outline" title="Order not found" />;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const history = order.order_status_history;
  const timeOf = (s: OrderStatus) => history.find((h) => h.to_status === s)?.created_at;
  const cancelled = order.status === 'cancelled';
  const steps: OrderStatus[] = cancelled
    ? ([...new Set(history.map((h) => h.to_status))] as OrderStatus[])
    : STATUS_FLOW;
  const currentIdx = steps.indexOf(order.status);
  const meta = STATUS_META[order.status];

  const askCancel = () =>
    Alert.alert('Cancel this order?', 'This cannot be undone.', [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => cancel.mutate() },
    ]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: order.order_number }} />

      {placed === '1' ? (
        <View style={styles.success}>
          <Ionicons name="checkmark-circle" size={44} color={colors.success} />
          <Text style={styles.successTitle}>Order placed!</Text>
          <Text style={styles.successText}>
            Thank you, {order.customer_name.split(' ')[0]}. The restaurant has been notified and will confirm your
            order shortly.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.headRow}>
          <View>
            <Text style={styles.orderNo}>Order {order.order_number}</Text>
            <Text style={styles.muted}>{formatDateTime(order.placed_at)}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>
        <Text style={[styles.hint, { color: meta.color }]}>{meta.hint}</Text>
        {cancelled ? (
          <View style={{ marginTop: 10 }}>
            <Banner
              kind="danger"
              text={`Cancelled ${order.cancelled_by === 'customer' ? 'by you' : 'by the restaurant'}${order.cancel_reason && order.cancelled_by !== 'customer' ? `: ${order.cancel_reason}` : ''}`}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Order status</Text>
        {steps.map((s, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          const isBad = s === 'cancelled';
          const color = isBad ? colors.danger : reached ? colors.success : colors.border;
          const t = timeOf(s);
          return (
            <View key={s} style={styles.step}>
              <View style={styles.stepLeft}>
                <View style={[styles.stepDot, { backgroundColor: reached ? color : colors.white, borderColor: color }]}>
                  <Ionicons name={reached ? STATUS_META[s].icon : 'ellipse-outline'} size={16} color={reached ? colors.white : colors.border} />
                </View>
                {i < steps.length - 1 ? <View style={[styles.stepLine, { backgroundColor: i < currentIdx ? colors.success : colors.border }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Text style={[styles.stepLabel, !reached && { color: colors.muted }, isCurrent && { fontWeight: '800' }]}>
                  {STATUS_META[s].label}
                </Text>
                {t ? <Text style={styles.muted}>{formatDateTime(t)}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Items</Text>
        {order.order_items.map((it) => (
          <View key={it.id} style={styles.row}>
            <Text style={styles.itemName}>
              {it.quantity} × {it.product_name}
            </Text>
            <Text style={styles.value}>{formatINR(it.line_total)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.muted}>Subtotal</Text>
          <Text style={styles.value}>{formatINR(order.subtotal)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Delivery charges</Text>
          <Text style={styles.value}>{order.delivery_fee > 0 ? formatINR(order.delivery_fee) : 'Free'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatINR(order.total)}</Text>
        </View>
        <Text style={[styles.muted, { marginTop: 6 }]}>
          Cash on delivery · {order.payment_status === 'paid' ? 'Paid' : 'To be paid on delivery'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Delivery address</Text>
        <Text style={styles.addr}>{order.customer_name}</Text>
        <Text style={styles.addr}>{order.customer_phone}</Text>
        <Text style={[styles.addr, { marginTop: 6 }]}>
          {order.delivery_house_no}, {order.delivery_street_locality}
          {order.delivery_landmark ? `\nNear ${order.delivery_landmark}` : ''}
          {`\n${order.delivery_city}, ${order.delivery_state} - ${order.delivery_pincode}`}
        </Text>
        {order.delivery_instructions ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>Note: {order.delivery_instructions}</Text>
        ) : null}
      </View>

      {order.status === 'pending' ? (
        <Button title="Cancel order" variant="danger" onPress={askCancel} loading={cancel.isPending} />
      ) : null}
      {restaurant?.phone && order.status !== 'delivered' && !cancelled ? (
        <Button title="Call restaurant" variant="outline" onPress={() => Linking.openURL(`tel:${restaurant.phone}`)} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  success: { backgroundColor: colors.successBg, borderRadius: radius.lg, padding: 18, alignItems: 'center', gap: 4 },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.success },
  successText: { fontSize: 14, color: colors.text, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, ...shadow },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderNo: { fontSize: 17, fontWeight: '800', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  hint: { marginTop: 10, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
  step: { flexDirection: 'row', gap: 12 },
  stepLeft: { alignItems: 'center', width: 28 },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 3, flex: 1, marginVertical: 2, borderRadius: 2 },
  stepLabel: { fontSize: 15, color: colors.text, fontWeight: '600', marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  itemName: { flex: 1, fontSize: 15, color: colors.text },
  value: { fontSize: 15, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  totalLabel: { fontSize: 17, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  addr: { fontSize: 15, color: colors.text, lineHeight: 21 },
});
