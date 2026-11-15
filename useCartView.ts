import { useMemo } from 'react';
import { round2 } from '@/lib/format';
import { useCart, type CartLine } from '@/store/cart';
import { useCartCheck, useStoreInfo } from './queries';

export interface CartRow extends CartLine {
  unavailable: boolean;
  priceChanged: boolean;
}

/** The cart as the customer should see it: live prices, unavailable items flagged, totals, and whether checkout is allowed. */
export function useCartView() {
  const lines = useCart((s) => s.lines);
  const check = useCartCheck(lines.map((l) => l.productId));
  const { restaurant, settings, isOpen, isLoading: storeLoading } = useStoreInfo();

  return useMemo(() => {
    const live = new Map((check.data ?? []).map((p) => [p.id, p]));
    const checked = !!check.data;

    const rows: CartRow[] = lines.map((l) => {
      const cur = live.get(l.productId);
      const unavailable = checked && (!cur || !cur.is_available);
      const price = cur && cur.is_available ? cur.price : l.price;
      return { ...l, price, unavailable, priceChanged: !!cur && cur.is_available && cur.price !== l.price };
    });

    const subtotal = round2(rows.filter((r) => !r.unavailable).reduce((n, r) => n + r.price * r.quantity, 0));
    const deliveryFee = rows.length > 0 ? settings?.delivery_fee ?? 0 : 0;
    const total = round2(subtotal + deliveryFee);
    const minOrder = settings?.min_order_amount ?? 0;
    const belowMin = rows.length > 0 && subtotal < minOrder;
    const hasUnavailable = rows.some((r) => r.unavailable);
    const ready = !storeLoading && !!settings && (rows.length === 0 || checked);

    return {
      rows,
      subtotal,
      deliveryFee,
      total,
      minOrder,
      belowMin,
      shortBy: round2(Math.max(0, minOrder - subtotal)),
      hasUnavailable,
      isOpen,
      ready,
      restaurant,
      settings,
      checking: check.isLoading,
      checkError: check.error as Error | null,
      retryCheck: check.refetch,
      canCheckout: rows.length > 0 && ready && !hasUnavailable && !belowMin && isOpen,
    };
  }, [lines, check.data, check.isLoading, check.error, check.refetch, settings, isOpen, storeLoading, restaurant]);
}
