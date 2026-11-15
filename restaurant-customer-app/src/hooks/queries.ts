import { useQuery } from '@tanstack/react-query';
import { RESTAURANT_SLUG } from '@/lib/config';
import { api } from '@/lib/supabase';

export function useRestaurant() {
  return useQuery({
    queryKey: ['restaurant', RESTAURANT_SLUG],
    queryFn: () => api.getRestaurant(RESTAURANT_SLUG),
    staleTime: 5 * 60_000,
  });
}

export function useSettings(restaurantId?: string) {
  return useQuery({
    queryKey: ['settings', restaurantId],
    queryFn: () => api.getSettings(restaurantId!),
    enabled: !!restaurantId,
  });
}

export function useOpenNow(restaurantId?: string) {
  return useQuery({
    queryKey: ['openNow', restaurantId],
    queryFn: () => api.isOpenNow(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 60_000, // opening hours can pass while the app is open
  });
}

export function useCategories(restaurantId?: string) {
  return useQuery({
    queryKey: ['menu', 'categories', restaurantId],
    queryFn: () => api.getCategories(restaurantId!),
    enabled: !!restaurantId,
  });
}

export function useProducts(restaurantId?: string) {
  return useQuery({
    queryKey: ['menu', 'products', restaurantId],
    queryFn: () => api.getAvailableProducts(restaurantId!),
    enabled: !!restaurantId,
  });
}

/** Restaurant + settings + open/closed in one place. */
export function useStoreInfo() {
  const restaurant = useRestaurant();
  const rid = restaurant.data?.id;
  const settings = useSettings(rid);
  const open = useOpenNow(rid);
  return {
    restaurant: restaurant.data,
    settings: settings.data,
    isOpen: open.data ?? false,
    isLoading: restaurant.isLoading || settings.isLoading,
    error: (restaurant.error ?? settings.error) as Error | null,
    refetch: async () => {
      await restaurant.refetch();
      await Promise.all([settings.refetch(), open.refetch()]);
    },
  };
}

/** Re-checks cart lines against the live menu (availability + current price). */
export function useCartCheck(productIds: string[]) {
  const key = [...productIds].sort().join(',');
  return useQuery({
    queryKey: ['cart-check', key],
    queryFn: () => api.getProductsByIds(productIds),
    enabled: productIds.length > 0,
    refetchOnMount: 'always',
  });
}

export function useMyOrders() {
  return useQuery({ queryKey: ['orders'], queryFn: () => api.getMyOrders() });
}

export function useOrder(id?: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
  });
}

export function useProduct(id?: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProduct(id!),
    enabled: !!id,
  });
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => api.getProfile(userId!),
    enabled: !!userId,
  });
}

export function useAddresses() {
  return useQuery({ queryKey: ['addresses'], queryFn: () => api.getAddresses() });
}
