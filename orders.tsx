import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { EmptyView, ErrorView, Loading } from '@/components/StateViews';
import { StatusBadge } from '@/components/StatusBadge';
import { useMyOrders } from '@/hooks/queries';
import { formatDateTime, formatINR } from '@/lib/format';
import { colors, radius, shadow } from '@/theme';

export default function Orders() {
  const { data, isLoading, error, refetch } = useMyOrders();
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading) return <Loading />;
  if (error) return <ErrorView message={(error as Error).message} onRetry={refetch} />;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListEmptyComponent={
        <EmptyView
          icon="receipt-outline"
          title="No orders yet"
          subtitle="Your orders will show up here."
          actionTitle="Browse menu"
          onAction={() => router.push('/menu')}
        />
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/order/${item.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
          <View style={styles.top}>
            <View style={{ flex: 1 }}>
              <Text style={styles.no}>{item.order_number}</Text>
              <Text style={styles.date}>{formatDateTime(item.placed_at)}</Text>
            </View>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.items} numberOfLines={2}>
            {item.order_items.map((i) => `${i.quantity} × ${i.product_name}`).join(', ')}
          </Text>
          <Text style={styles.total}>{formatINR(item.total)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 8, ...shadow },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  no: { fontSize: 16, fontWeight: '800', color: colors.text },
  date: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  items: { fontSize: 14, color: colors.text },
  total: { fontSize: 16, fontWeight: '800', color: colors.primary },
});
