import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { ClosedBanner } from '@/components/ClosedBanner';
import { ProductImage } from '@/components/ProductImage';
import { QtyStepper } from '@/components/QtyStepper';
import { Banner, EmptyView, ErrorView, Loading } from '@/components/StateViews';
import { VegMark } from '@/components/VegMark';
import { useCartView } from '@/hooks/useCartView';
import { formatINR, round2 } from '@/lib/format';
import { useCart } from '@/store/cart';
import { colors, radius, shadow } from '@/theme';

export default function CartScreen() {
  const v = useCartView();
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);

  if (v.rows.length === 0) {
    return (
      <EmptyView
        icon="cart-outline"
        title="Your cart is empty"
        subtitle="Add something delicious from the menu."
        actionTitle="Browse menu"
        onAction={() => router.push('/menu')}
      />
    );
  }
  if (v.checkError) return <ErrorView message={v.checkError.message} onRetry={() => v.retryCheck()} />;
  if (!v.ready) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
        <ClosedBanner />
        {v.hasUnavailable ? (
          <Banner kind="danger" text="Some items are no longer available. Please remove them to continue." />
        ) : null}
        {v.belowMin && !v.hasUnavailable ? (
          <Banner kind="warning" text={`Add ${formatINR(v.shortBy)} more to reach the minimum order of ${formatINR(v.minOrder)}.`} />
        ) : null}

        {v.rows.map((r) => (
          <View key={r.productId} style={[styles.line, r.unavailable && { opacity: 0.7 }]}>
            <ProductImage path={r.imagePath} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <VegMark veg={r.isVeg} />
                <Text style={styles.name} numberOfLines={2}>
                  {r.name}
                </Text>
              </View>
              {r.unavailable ? (
                <Text style={styles.unavailable}>No longer available</Text>
              ) : (
                <Text style={styles.each}>
                  {formatINR(r.price)} each{r.priceChanged ? ' · price updated' : ''}
                </Text>
              )}
              <View style={styles.bottom}>
                {r.unavailable ? (
                  <Pressable onPress={() => remove(r.productId)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : (
                  <QtyStepper compact value={r.quantity} onChange={(n) => setQty(r.productId, n)} />
                )}
                {!r.unavailable ? <Text style={styles.lineTotal}>{formatINR(round2(r.price * r.quantity))}</Text> : null}
              </View>
            </View>
          </View>
        ))}

        <View style={styles.summary}>
          <Row label="Subtotal" value={formatINR(v.subtotal)} />
          <Row label="Delivery charges" value={v.deliveryFee > 0 ? formatINR(v.deliveryFee) : 'Free'} />
          <View style={styles.divider} />
          <Row label="Total payable" value={formatINR(v.total)} bold />
          <Text style={styles.cod}>Payment: Cash on delivery</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatINR(v.total)}</Text>
        </View>
        <Button title="Checkout" onPress={() => router.push('/checkout')} disabled={!v.canCheckout} style={{ flex: 1, marginLeft: 16 }} />
      </View>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 10, ...shadow },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  each: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  unavailable: { fontSize: 12.5, color: colors.danger, fontWeight: '700', marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  lineTotal: { fontSize: 16, fontWeight: '800', color: colors.text },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  removeText: { color: colors.danger, fontWeight: '700' },
  summary: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, ...shadow },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 15, color: colors.muted },
  rowValue: { fontSize: 15, color: colors.text, fontWeight: '600' },
  bold: { fontSize: 17, fontWeight: '800', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  cod: { marginTop: 8, fontSize: 12.5, color: colors.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLabel: { fontSize: 12, color: colors.muted },
  footerTotal: { fontSize: 20, fontWeight: '800', color: colors.text },
});
