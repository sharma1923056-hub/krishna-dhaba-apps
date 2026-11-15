import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { ProductImage } from '@/components/ProductImage';
import { QtyStepper } from '@/components/QtyStepper';
import { EmptyView, ErrorView, Loading } from '@/components/StateViews';
import { VegMark } from '@/components/VegMark';
import { useProduct } from '@/hooks/queries';
import { formatINR, round2 } from '@/lib/format';
import { useCart } from '@/store/cart';
import { colors } from '@/theme';

export default function ProductDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: product, isLoading, error, refetch } = useProduct(id);
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);

  if (isLoading) return <Loading />;
  if (error) return <ErrorView message={(error as Error).message} onRetry={refetch} />;
  if (!product || !product.is_available) {
    return (
      <EmptyView
        icon="sad-outline"
        title="This item is unavailable"
        subtitle="It may have been removed or is out of stock right now."
        actionTitle="Back to menu"
        onAction={() => router.back()}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ProductImage path={product.image_path} style={styles.image} />
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <VegMark veg={product.is_veg} />
            <Text style={styles.name}>{product.name}</Text>
          </View>
          <Text style={styles.price}>{formatINR(product.price)}</Text>
          {product.description ? <Text style={styles.desc}>{product.description}</Text> : null}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <QtyStepper value={qty} min={1} onChange={setQty} />
        <Button
          title={`Add to cart · ${formatINR(round2(product.price * qty))}`}
          onPress={() => {
            add(product, qty);
            router.back();
          }}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 260 },
  body: { padding: 20 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.text },
  price: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 8 },
  desc: { fontSize: 15, color: colors.muted, marginTop: 12, lineHeight: 22 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
