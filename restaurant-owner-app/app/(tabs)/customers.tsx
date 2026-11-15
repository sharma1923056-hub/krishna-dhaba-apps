import React, { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAccess } from '@/store';
import { supabase } from '@/lib/supabase';
import { Busy, C, Card, Field, Heading, Screen } from '@/components/ui';

export default function Customers() {
  const { restaurantId } = useAccess();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (term: string) => {
    if (!restaurantId) return;
    const { data, error } = await supabase.rpc('customer_summary', {
      p_restaurant_id: restaurantId, p_search: term.trim() || null, p_limit: 50, p_offset: 0
    });
    if (error) Alert.alert('Customer report unavailable', `${error.message}\n\nCheck that migration 005_owner_app.sql has been run in Supabase.`);
    else setRows(data ?? []);
    setLoading(false);
  }, [restaurantId]);
  useFocusEffect(useCallback(() => { void load(search); }, [load]));
  return <Screen>
    <Heading title="Customers" subtitle="Customer summaries are calculated from orders, not private address books." />
    <Field label="SEARCH NAME OR PHONE" value={search} onChangeText={setSearch} placeholder="Search customers" onSubmitEditing={() => { setLoading(true); void load(search); }} returnKeyType="search" />
    {loading && <Busy />}
    {!loading && rows.length === 0 && <Card><Text style={{ color: C.muted }}>No customer records found.</Text></Card>}
    {rows.map((c, i) => <Card key={`${c.customer_phone}-${i}`}>
      <Text style={{ color: C.ink, fontWeight: '900', fontSize: 16 }}>{c.customer_name || 'Customer'}</Text>
      <Text style={{ color: C.muted, marginTop: 4 }}>{c.customer_phone}</Text>
      <Text style={{ color: C.ink, marginTop: 8 }}>{c.total_orders} orders • {c.delivered_orders} delivered</Text>
      <Text style={{ color: C.orange, fontWeight: '900', marginTop: 5 }}>Delivered spend: ₹{Number(c.total_spent).toFixed(2)}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>Last order: {c.last_order_at ? new Date(c.last_order_at).toLocaleString() : '—'}</Text>
    </Card>)}
  </Screen>;
}
