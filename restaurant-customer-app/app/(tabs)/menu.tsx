import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { ClosedBanner } from '@/components/ClosedBanner';
import { ProductRow } from '@/components/ProductRow';
import { EmptyView, ErrorView, Loading } from '@/components/StateViews';
import { useCategories, useProducts, useRestaurant } from '@/hooks/queries';
import { colors, radius } from '@/theme';

export default function Menu() {
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const restaurant = useRestaurant();
  const rid = restaurant.data?.id;
  const categories = useCategories(rid);
  const products = useProducts(rid);

  const [search, setSearch] = useState(params.q ?? '');
  const [selected, setSelected] = useState<string | null>(params.category ?? null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSearch(params.q ?? '');
    setSelected(params.category ?? null);
  }, [params.q, params.category]);

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (categories.data ?? [])
      .filter((c) => !selected || c.id === selected)
      .map((c) => ({
        key: c.id,
        title: c.name,
        data: (products.data ?? []).filter(
          (p) =>
            p.category_id === c.id &&
            (!term || p.name.toLowerCase().includes(term) || (p.description ?? '').toLowerCase().includes(term)),
        ),
      }))
      .filter((s) => s.data.length > 0);
  }, [categories.data, products.data, search, selected]);

  if (restaurant.isLoading || categories.isLoading || products.isLoading) return <Loading />;
  const err = restaurant.error ?? categories.error ?? products.error;
  if (err) {
    return (
      <ErrorView
        message={(err as Error).message}
        onRetry={() => {
          restaurant.refetch();
          categories.refetch();
          products.refetch();
        }}
      />
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([categories.refetch(), products.refetch()]);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.top}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dishes"
            placeholderTextColor="#B5A597"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          <Chip label="All" active={!selected} onPress={() => setSelected(null)} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={selected === c.id} onPress={() => setSelected(c.id)} />
          ))}
        </ScrollView>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <ClosedBanner />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProductRow product={item} />}
        renderSectionHeader={({ section }) => <Text style={styles.header}>{section.title}</Text>}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyView
            icon="search-outline"
            title={search ? 'No dishes found' : 'Nothing on the menu yet'}
            subtitle={search ? 'Try a different name or category.' : 'Please check back soon.'}
          />
        }
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text },
  header: { fontSize: 18, fontWeight: '800', color: colors.text, marginHorizontal: 16, marginTop: 16, marginBottom: 10 },
});
