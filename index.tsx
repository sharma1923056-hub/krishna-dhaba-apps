import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClosedBanner } from '@/components/ClosedBanner';
import { PopularCard } from '@/components/PopularCard';
import { ErrorView, Loading } from '@/components/StateViews';
import { useCategories, useProducts, useStoreInfo } from '@/hooks/queries';
import { formatClock, formatINR } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { restaurant, settings, isOpen, isLoading, error, refetch } = useStoreInfo();
  const categories = useCategories(restaurant?.id);
  const products = useProducts(restaurant?.id);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !restaurant || !settings) return <ErrorView message={error?.message} onRetry={refetch} />;

  const cats = categories.data ?? [];
  const catIds = new Set(cats.map((c) => c.id));
  const popular = (products.data ?? []).filter((p) => p.is_popular && catIds.has(p.category_id));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), categories.refetch(), products.refetch()]);
    setRefreshing(false);
  };

  const search = () => router.push({ pathname: '/menu', params: { q: q.trim() } });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.name}>{restaurant.name}</Text>
        {restaurant.address ? (
          <View style={styles.line}>
            <Ionicons name="location-outline" size={15} color="#FFE3D3" />
            <Text style={styles.heroText} numberOfLines={2}>
              {restaurant.address}
            </Text>
          </View>
        ) : null}
        <View style={styles.statusRow}>
          <View style={[styles.pill, { backgroundColor: isOpen ? colors.successBg : colors.dangerBg }]}>
            <View style={[styles.dot, { backgroundColor: isOpen ? colors.success : colors.danger }]} />
            <Text style={[styles.pillText, { color: isOpen ? colors.success : colors.danger }]}>
              {isOpen ? 'Open now' : 'Closed'}
            </Text>
          </View>
          <Text style={styles.heroText}>
            {formatClock(settings.opening_time)} – {formatClock(settings.closing_time)}
          </Text>
        </View>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Ionicons name="bicycle-outline" size={15} color={colors.white} />
            <Text style={styles.chipText}>
              {settings.delivery_fee > 0 ? `Delivery ${formatINR(settings.delivery_fee)}` : 'Free delivery'}
            </Text>
          </View>
          {settings.min_order_amount > 0 ? (
            <View style={styles.chip}>
              <Ionicons name="bag-handle-outline" size={15} color={colors.white} />
              <Text style={styles.chipText}>Min order {formatINR(settings.min_order_amount)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Search for dishes"
          placeholderTextColor="#B5A597"
          style={styles.searchInput}
        />
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <ClosedBanner />
      </View>

      {cats.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {cats.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/menu', params: { category: c.id } })}
                style={styles.catChip}
              >
                <Text style={styles.catText}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {popular.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Popular right now</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            {popular.map((p) => (
              <PopularCard key={p.id} product={p} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {!products.isLoading && (products.data?.length ?? 0) === 0 ? (
        <Text style={styles.empty}>The menu is being updated. Please check back soon.</Text>
      ) : null}

      <Pressable onPress={() => router.push('/menu')} style={styles.menuBtn}>
        <Text style={styles.menuBtnText}>View full menu</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.white} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 36,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  name: { color: colors.white, fontSize: 30, fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  heroText: { color: '#FFE3D3', fontSize: 13, flexShrink: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  chipText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: -22,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    ...shadow,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  catChip: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  catText: { color: colors.text, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 28, paddingHorizontal: 24 },
  menuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  menuBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
