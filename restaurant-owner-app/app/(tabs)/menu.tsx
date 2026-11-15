import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAccess } from '@/store';
import { supabase } from '@/lib/supabase';
import { Action, Busy, C, Card, Field, Heading, Screen } from '@/components/ui';

export default function Menu() {
  const { restaurantId } = useAccess();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const load = useCallback(async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase.from('products').select('id,name,description,price,is_available,is_popular,is_veg,category_id,sort_order')
      .eq('restaurant_id', restaurantId).is('deleted_at', null).order('sort_order').order('name');
    if (error) Alert.alert('Menu error', error.message); else setItems(data ?? []);
    setLoading(false);
  }, [restaurantId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const toggle = async (item: any, value: boolean) => {
    const { error } = await supabase.from('products').update({ is_available: value }).eq('id', item.id).eq('restaurant_id', restaurantId!);
    if (error) Alert.alert('Update failed', error.message); else await load();
  };
  const savePrice = async (id: string) => {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) { Alert.alert('Invalid price', 'Enter a valid non-negative price.'); return; }
    const { error } = await supabase.from('products').update({ price: n }).eq('id', id).eq('restaurant_id', restaurantId!);
    if (error) Alert.alert('Price not saved', error.message);
    else { setEditing(null); setPrice(''); await load(); }
  };
  if (loading) return <Screen><Busy /></Screen>;
  return <Screen>
    <Heading title="Menu management" subtitle="Control what customers can see and order." />
    {items.map(item => <Card key={item.id}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: C.ink, fontWeight: '800', fontSize: 16 }}>{item.name}</Text>
          <Text style={{ color: C.muted, marginTop: 4 }}>{item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}{item.is_popular ? ' • Popular' : ''}</Text>
          <Text style={{ color: C.orange, fontWeight: '900', marginTop: 6 }}>₹{Number(item.price).toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: 'center' }}><Text style={{ color: C.muted, fontSize: 11 }}>Available</Text><Switch value={item.is_available} onValueChange={v => void toggle(item, v)} trackColor={{ true: C.green }} /></View>
      </View>
      {editing === item.id ? <><Field label="NEW PRICE (₹)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /><Action title="Save price" onPress={() => void savePrice(item.id)} /><Action title="Discard" secondary onPress={() => setEditing(null)} /></> :
        <Action title="Edit price" secondary onPress={() => { setEditing(item.id); setPrice(String(item.price)); }} />}
    </Card>)}
    <Text style={{ color: C.muted, fontSize: 12 }}>This first version supports availability and price editing. Category and new-item creation can be added after we confirm the live database setup.</Text>
  </Screen>;
}
