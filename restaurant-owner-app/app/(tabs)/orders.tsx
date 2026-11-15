import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAccess } from '@/store';
import { supabase } from '@/lib/supabase';
import { Action, Busy, C, Card, Heading, Screen } from '@/components/ui';

const nextStatus: Record<string, string> = {
  pending: 'confirmed', confirmed: 'preparing', preparing: 'ready_for_dispatch',
  ready_for_dispatch: 'out_for_delivery', out_for_delivery: 'delivered'
};
const label: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing',
  ready_for_dispatch: 'Ready for dispatch', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled'
};

export default function Orders() {
  const { restaurantId } = useAccess();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase.from('orders')
      .select('id,order_number,status,customer_name,customer_phone,total,placed_at,payment_status,order_items(product_name,quantity)')
      .eq('restaurant_id', restaurantId).order('placed_at', { ascending: false }).limit(100);
    if (error) Alert.alert('Could not load orders', error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, [restaurantId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Keep the order list current while this screen is open. Realtime is an
  // in-app update channel; background/closed-app alerts are handled separately
  // by the server push-notification workflow.
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`owner-orders-${restaurantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => { void load(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [restaurantId, load]);

  const advance = async (id: string, status: string) => {
    if (status === 'cancelled') return;
    const { error } = await supabase.rpc('update_order_status', { p_order_id: id, p_new_status: status, p_reason: null });
    if (error) Alert.alert('Status not changed', error.message);
    else await load();
  };
  const cancel = (id: string) => Alert.alert('Cancel this order?', 'The cancellation reason will be recorded as: Cancelled by restaurant owner.', [
    { text: 'Keep order', style: 'cancel' },
    { text: 'Cancel order', style: 'destructive', onPress: async () => {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: id, p_new_status: 'cancelled', p_reason: 'Cancelled by restaurant owner'
      });
      if (error) Alert.alert('Could not cancel', error.message); else await load();
    } }
  ]);
  if (loading) return <Screen><Busy /></Screen>;
  return <Screen>
    <Heading title="Orders" subtitle="Recent orders from the Krishna Dhaba Customer App" />
    <Action title="Refresh orders" secondary onPress={() => { setLoading(true); void load(); }} />
    {rows.length === 0 && <Card><Text style={{ color: C.muted }}>No orders found yet.</Text></Card>}
    {rows.map(o => <Card key={o.id}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: C.ink, fontWeight: '900', fontSize: 16 }}>{o.order_number}</Text>
        <Text style={{ color: C.orange, fontWeight: '800' }}>{label[o.status] ?? o.status}</Text>
      </View>
      <Text style={{ color: C.ink, marginTop: 8 }}>{o.customer_name} • {o.customer_phone}</Text>
      <Text style={{ color: C.muted, marginTop: 4 }}>{(o.order_items ?? []).map((i: any) => `${i.product_name} × ${i.quantity}`).join(', ')}</Text>
      <Text style={{ color: C.ink, fontWeight: '900', marginTop: 8 }}>₹{Number(o.total).toFixed(2)} • {o.payment_status}</Text>
      {!!nextStatus[o.status] && <Action title={`Move to ${label[nextStatus[o.status]]}`} onPress={() => void advance(o.id, nextStatus[o.status])} />}
      {['pending','confirmed','preparing','ready_for_dispatch','out_for_delivery'].includes(o.status) && <Action title="Cancel order" secondary onPress={() => cancel(o.id)} />}
    </Card>)}
  </Screen>;
}
