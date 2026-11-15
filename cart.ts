import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Product } from '@/api/types';

export interface CartLine {
  productId: string;
  name: string;
  price: number; // last price we saw (display only; the server always re-prices)
  imagePath: string | null;
  isVeg: boolean;
  quantity: number;
}

const MAX_QTY = 50;

interface CartState {
  lines: CartLine[];
  add: (p: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (p, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === p.id);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === p.id
                  ? { ...l, price: p.price, quantity: Math.min(MAX_QTY, l.quantity + qty) }
                  : l,
              ),
            };
          }
          return {
            lines: [
              ...s.lines,
              {
                productId: p.id,
                name: p.name,
                price: p.price,
                imagePath: p.image_path,
                isVeg: p.is_veg,
                quantity: Math.min(MAX_QTY, qty),
              },
            ],
          };
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.productId !== productId)
              : s.lines.map((l) =>
                  l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l,
                ),
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'kd-cart-v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
