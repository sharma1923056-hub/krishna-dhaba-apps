
import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAccess } from '@/store';
import { supabase } from '@/lib/supabase';
import { Action, Busy, C, Card, Field, Heading, Screen } from '@/components/ui';

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  is_popular: boolean;
  is_veg: boolean;
  category_id: string | null;
};

type Category = {
  id: string;
  name: string;
  is_active: boolean;
};

const emptyProduct = {
  name: '',
  description: '',
  price: '',
  category_id: null as string | null,
  is_veg: true,
  is_popular: false,
  is_available: true,
};

export default function Menu() {
  const { restaurantId } = useAccess();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [showForm, setShowForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;

    const [productResult, categoryResult] = await Promise.all([
      supabase.from('products')
        .select('id,name,description,price,is_available,is_popular,is_veg,category_id')
        .eq('restaurant_id', restaurantId)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name'),
      supabase.from('categories')
        .select('id,name,is_active')
        .eq('restaurant_id', restaurantId)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name'),
    ]);

    if (productResult.error) {
      Alert.alert('Menu error', productResult.error.message);
    } else {
      setItems((productResult.data ?? []) as Product[]);
    }

    if (categoryResult.error) {
      Alert.alert('Category error', categoryResult.error.message);
    } else {
      setCategories((categoryResult.data ?? []) as Category[]);
    }

    setLoading(false);
  }, [restaurantId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const updateForm = (key: string, value: any) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const startNew = () => {
    setEditing(null);
    setForm(emptyProduct);
    setShowForm(true);
  };

  const startEdit = (item: Product) => {
    setEditing(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      category_id: item.category_id,
      is_veg: item.is_veg,
      is_popular: item.is_popular,
      is_available: item.is_available,
    });
    setShowForm(true);
  };

  const saveProduct = async () => {
    if (!restaurantId) return;

    const name = form.name.trim();
    const price = Number(form.price);

    if (!name) {
      Alert.alert('Missing name', 'Please enter the food item name.');
      return;
    }

    if (!form.price.trim() || !Number.isFinite(price) || price < 0) {
      Alert.alert('Invalid price', 'Please enter a valid price.');
      return;
    }

    setSaving(true);

    const values = {
      name,
      description: form.description.trim() || null,
      price,
      category_id: form.category_id,
      is_veg: form.is_veg,
      is_popular: form.is_popular,
      is_available: form.is_available,
    };

    const result = editing
      ? await supabase.from('products')
          .update(values)
          .eq('id', editing)
          .eq('restaurant_id', restaurantId)
      : await supabase.from('products')
          .insert({ ...values, restaurant_id: restaurantId });

    setSaving(false);

    if (result.error) {
      Alert.alert('Could not save item', result.error.message);
      return;
    }

    setShowForm(false);
    setEditing(null);
    setForm(emptyProduct);
    await load();
    Alert.alert('Saved', 'Food item has been saved.');
  };

  const toggleAvailability = async (item: Product, value: boolean) => {
    const { error } = await supabase.from('products')
      .update({ is_available: value })
      .eq('id', item.id)
      .eq('restaurant_id', restaurantId!);

    if (error) Alert.alert('Update failed', error.message);
    else await load();
  };

  const deleteProduct = (item: Product) => {
    Alert.alert(
      'Remove food item?',
      `Remove "${item.name}" from the customer menu?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('products')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', item.id)
              .eq('restaurant_id', restaurantId!);

            if (error) Alert.alert('Could not remove item', error.message);
            else await load();
          },
        },
      ]
    );
  };

  const addCategory = async () => {
    const name = categoryName.trim();
    if (!name || !restaurantId) {
      Alert.alert('Enter category name', 'Please type a category name.');
      return;
    }

    const { error } = await supabase.from('categories').insert({
      name,
      restaurant_id: restaurantId,
      is_active: true,
    });

    if (error) {
      Alert.alert('Could not add category', error.message);
      return;
    }

    setCategoryName('');
    await load();
    Alert.alert('Added', 'Category has been created.');
  };

  const deactivateCategory = (category: Category) => {
    Alert.alert(
      'Deactivate category?',
      `Hide "${category.name}" from the active categories?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('categories')
              .update({ is_active: false })
              .eq('id', category.id)
              .eq('restaurant_id', restaurantId!);

            if (error) Alert.alert('Update failed', error.message);
            else {
              if (form.category_id === category.id) {
                updateForm('category_id', null);
              }
              await load();
            }
          },
        },
      ]
    );
  };

  if (loading) return <Screen><Busy /></Screen>;

  return (
    <Screen>
      <Heading
        title="Menu management"
        subtitle="Add food, update prices and manage categories."
      />

      <Card>
        <Text style={{ color: C.ink, fontSize: 17, fontWeight: '800', marginBottom: 10 }}>
          Categories
        </Text>

        <Field
          label="NEW CATEGORY NAME"
          value={categoryName}
          onChangeText={setCategoryName}
          placeholder="Example: Biryani"
        />
        <Action title="Add category" onPress={() => void addCategory()} />

        {categories.map(category => (
          <View key={category.id} style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 9,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
          }}>
            <Text style={{ color: C.ink, fontWeight: '600', flex: 1 }}>
              {category.name}
              {!category.is_active ? ' (Inactive)' : ''}
            </Text>
            {category.is_active && (
              <Action
                title="Deactivate"
                secondary
                onPress={() => deactivateCategory(category)}
              />
            )}
          </View>
        ))}
      </Card>

      <Action title="+ Add food item" onPress={startNew} />

      {showForm && (
        <Card>
          <Text style={{ color: C.ink, fontSize: 18, fontWeight: '800', marginBottom: 14 }}>
            {editing ? 'Edit food item' : 'New food item'}
          </Text>

          <Field
            label="FOOD NAME"
            value={form.name}
            onChangeText={v => updateForm('name', v)}
            placeholder="Example: Paneer Butter Masala"
          />

          <Field
            label="DESCRIPTION"
            value={form.description}
            onChangeText={v => updateForm('description', v)}
            placeholder="Describe the food item"
            multiline
          />

          <Field
            label="PRICE (₹)"
            value={form.price}
            onChangeText={v => updateForm('price', v)}
            keyboardType="decimal-pad"
            placeholder="Example: 180"
          />

          <Text style={{ color: C.muted, fontWeight: '700', marginBottom: 8 }}>
            SELECT CATEGORY
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
            <Pressable
              onPress={() => updateForm('category_id', null)}
              style={{
                padding: 10, margin: 3, borderRadius: 9,
                backgroundColor: form.category_id === null ? C.pale : C.bg,
                borderWidth: 1, borderColor: C.line,
              }}
            >
              <Text style={{ color: C.ink }}>No category</Text>
            </Pressable>

            {categories.filter(c => c.is_active).map(category => (
              <Pressable
                key={category.id}
                onPress={() => updateForm('category_id', category.id)}
                style={{
                  padding: 10, margin: 3, borderRadius: 9,
                  backgroundColor: form.category_id === category.id ? C.pale : C.bg,
                  borderWidth: 1, borderColor: C.line,
                }}
              >
                <Text style={{ color: C.ink }}>{category.name}</Text>
              </Pressable>
            ))}
          </View>

          {[
            ['Vegetarian', 'is_veg'],
            ['Popular item', 'is_popular'],
            ['Available for ordering', 'is_available'],
          ].map(([label, key]) => (
            <View key={key} style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 7,
            }}>
              <Text style={{ color: C.ink, flex: 1 }}>{label}</Text>
              <Switch
                value={Boolean(form[key as keyof typeof form])}
                onValueChange={v => updateForm(key, v)}
                trackColor={{ true: C.green }}
              />
            </View>
          ))}

          <Action
            title={saving ? 'Saving...' : 'Save food item'}
            disabled={saving}
            onPress={() => void saveProduct()}
          />
          <Action
            title="Cancel"
            secondary
            onPress={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        </Card>
      )}

      <Heading title="Food items" subtitle={`${items.length} items in your menu`} />

      {items.map(item => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: C.ink, fontWeight: '800', fontSize: 16 }}>
                {item.name}
              </Text>
              <Text style={{ color: C.muted, marginTop: 4 }}>
                {item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
                {item.is_popular ? ' • Popular' : ''}
              </Text>
              <Text style={{ color: C.orange, fontWeight: '900', marginTop: 6 }}>
                ₹{Number(item.price).toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontSize: 11 }}>Available</Text>
              <Switch
                value={item.is_available}
                onValueChange={v => void toggleAvailability(item, v)}
                trackColor={{ true: C.green }}
              />
            </View>
          </View>

          {!!item.description && (
            <Text style={{ color: C.muted, marginTop: 8 }}>{item.description}</Text>
          )}

          <Action title="Edit item" secondary onPress={() => startEdit(item)} />
          <Action title="Remove item" secondary onPress={() => deleteProduct(item)} />
        </Card>
      ))}

      {items.length === 0 && (
        <Text style={{ color: C.muted, textAlign: 'center', marginTop: 20 }}>
          No food items yet. Tap "Add food item" to get started.
        </Text>
      )}
    </Screen>
  );
}
