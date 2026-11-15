import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAccess } from '@/store';
import { supabase } from '@/lib/supabase';
import { Busy, C, Card, Heading, Screen, Stat, styles } from '@/components/ui';

type Stats = { total_orders?: number; new_orders?: number; pending?: number; confirmed?: number; preparing?: number; ready_for_dispatch?: number; out_for_delivery?: number; completed?: number; cancelled?: number; today_sales?: number; overall_sales?: number };

export default function Dashboard() {
  const { restaurantId, restaurantName, role } = useAccess();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase.rpc('dashboard_stats', { p_restaurant_id: restaurantId });
    if (!error) setStats(data as Stats);
    setLoading(false); setRefreshing(false);
  }, [restaurantId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (loading) return <Screen><Busy /></Screen>;
  const money = (v?: number) => `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return <Screen>
    <Heading title={restaurantName} subtitle={`Good day • Signed in as ${role ?? 'team member'}`} />
    <Card>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700' }}>TODAY'S DELIVERED SALES</Text>
      <Text style={{ color: C.orange, fontSize: 32, fontWeight: '900', marginTop: 6 }}>{money(stats?.today_sales)}</Text>
      <Text style={{ color: C.muted, marginTop: 4 }}>Overall delivered sales: {money(stats?.overall_sales)}</Text>
    </Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <Stat label="Today's orders" value={stats?.new_orders ?? 0} />
      <Stat label="Pending" value={stats?.pending ?? 0} accent />
      <Stat label="Preparing" value={stats?.preparing ?? 0} />
      <Stat label="Ready to dispatch" value={stats?.ready_for_dispatch ?? 0} />
      <Stat label="Out for delivery" value={stats?.out_for_delivery ?? 0} />
      <Stat label="Delivered" value={stats?.completed ?? 0} />
      <Stat label="Cancelled" value={stats?.cancelled ?? 0} />
      <Stat label="All orders" value={stats?.total_orders ?? 0} />
    </View>
    <Card><Text style={{ fontWeight: '800', color: C.ink }}>Live data</Text><Text style={{ color: C.muted, marginTop: 5 }}>Pull down to refresh the latest dashboard totals.</Text></Card>
    <View style={{ height: 1 }} />
  </Screen>;
}
