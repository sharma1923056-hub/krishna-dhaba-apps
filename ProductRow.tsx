import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Product } from '@/api/types';
import { formatINR } from '@/lib/format';
import { useCart } from '@/store/cart';
import { colors, radius, shadow } from '@/theme';
import { Button } from './Button';
import { ProductImage } from './ProductImage';
import { QtyStepper } from './QtyStepper';
import { VegMark } from './VegMark';

export function ProductRow({ product }: { product: Product }) {
  const qty = useCart((s) => s.lines.find((l) => l.productId === product.id)?.quantity ?? 0);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);

  return (
    <Pressable
      onPress={() => router.push(`/product/${product.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
    >
      <ProductImage path={product.image_path} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <VegMark veg={product.is_veg} />
          <Text style={styles.name} numberOfLines={1}>
            {product.name}
          </Text>
        </View>
        {product.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {product.description}
          </Text>
        ) : null}
        <View style={styles.bottom}>
          <Text style={styles.price}>{formatINR(product.price)}</Text>
          {qty > 0 ? (
            <QtyStepper compact value={qty} onChange={(n) => setQty(product.id, n)} />
          ) : (
            <Button title="Add" onPress={() => add(product)} variant="outline" style={styles.addBtn} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 12,
    ...shadow,
  },
  image: { width: 92, height: 92, borderRadius: radius.md },
  body: { flex: 1, justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  desc: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  price: { fontSize: 16, fontWeight: '800', color: colors.text },
  addBtn: { minHeight: 34, paddingHorizontal: 18, borderRadius: 10 },
});
