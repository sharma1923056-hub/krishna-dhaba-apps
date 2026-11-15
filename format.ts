import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { OrderStatus } from '@/api/types';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatINR(n: number): string {
  const v = round2(n);
  return '\u20B9' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTimeOfDay(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${formatTimeOfDay(d)}`;
}

/** "10:00:00" -> "10:00 AM" */
export function formatClock(t: string): string {
  const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(hh)) return t;
  const d = new Date(2000, 0, 1, hh, mm || 0);
  return formatTimeOfDay(d);
}

export const STATUS_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_dispatch',
  'out_for_delivery',
  'delivered',
];

export const STATUS_META: Record<
  OrderStatus,
  { label: string; hint: string; color: string; bg: string; icon: IconName }
> = {
  pending: {
    label: 'Pending',
    hint: 'Waiting for the restaurant to confirm your order',
    color: colors.warning,
    bg: colors.warningBg,
    icon: 'time-outline',
  },
  confirmed: {
    label: 'Confirmed',
    hint: 'The restaurant has accepted your order',
    color: colors.success,
    bg: colors.successBg,
    icon: 'checkmark-circle-outline',
  },
  preparing: {
    label: 'Preparing',
    hint: 'Your food is being prepared',
    color: colors.success,
    bg: colors.successBg,
    icon: 'restaurant-outline',
  },
  ready_for_dispatch: {
    label: 'Ready for Dispatch',
    hint: 'Your order is packed and ready to go',
    color: colors.success,
    bg: colors.successBg,
    icon: 'bag-check-outline',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    hint: 'Your order is on its way',
    color: colors.success,
    bg: colors.successBg,
    icon: 'bicycle-outline',
  },
  delivered: {
    label: 'Delivered',
    hint: 'Enjoy your meal!',
    color: colors.success,
    bg: colors.successBg,
    icon: 'checkmark-done-outline',
  },
  cancelled: {
    label: 'Cancelled',
    hint: 'This order was cancelled',
    color: colors.danger,
    bg: colors.dangerBg,
    icon: 'close-circle-outline',
  },
};

export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
}
