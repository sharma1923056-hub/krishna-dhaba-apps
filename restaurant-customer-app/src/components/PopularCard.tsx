import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Product } from '@/api/types';
import { formatINR } from '@/lib/format';
import { useCart } from '@/store/cart';
import { colors, radius, shadow } from '@/theme';
import { ProductImage } from './ProductImage';
import { VegMark } from './VegMark';
import { Ionicons } from '@expo/vector-icons';

export function PopularCard({ product }: { product: Product }) {
  const add = useCart((s) => s.add);
  return (
    <Pressable onPress={() => router.push(`/product/${product.id}`)} style={styles.card}>
      <ProductImage path={product.image_path} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <VegMark veg={product.is_veg} />
          <Text numberOfLines={1} style={styles.name}>
            {product.name}
          </Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.price}>{formatINR(product.price)}</Text>
          <Pressable accessibilityLabel={`Add ${product.name} to cart`} onPress={() => add(product)} style={styles.plus} hitSlop={6}>
            <Ionicons name="add" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 170, backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', marginRight: 12, ...shadow },
  image: { width: '100%', height: 110 },
  body: { padding: 10, gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 15, fontWeight: '800', color: colors.text },
  plus: { backgroundColor: colors.primary, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
