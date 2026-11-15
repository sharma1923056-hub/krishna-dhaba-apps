// All database access for the Customer app lives here.
// Written as a factory so the exact same code can be tested against a real database.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Category,
  NewAddress,
  OrderDetail,
  OrderSummary,
  PlaceOrderInput,
  PlaceOrderResult,
  Product,
  Profile,
  Restaurant,
  RestaurantSettings,
  SavedAddress,
} from './types';

export class ApiError extends Error {
  /** true when the server rejected the request (validation etc.); false for network problems */
  fromServer: boolean;
  constructor(message: string, fromServer: boolean) {
    super(message);
    this.name = 'ApiError';
    this.fromServer = fromServer;
  }
}

function fail(error: { message: string; code?: string } | null): never {
  const msg = error?.message ?? 'Something went wrong.';
  const networkish = !error?.code && /network request failed|failed to fetch|timeout|fetch/i.test(msg);
  throw new ApiError(networkish ? 'Network problem. Please check your internet connection.' : msg, !networkish);
}

export function createApi(sb: SupabaseClient) {
  return {
    // ---------- restaurant ----------
    async getRestaurant(slug: string): Promise<Restaurant> {
      const { data, error } = await sb
        .from('restaurants')
        .select('id, name, slug, logo_url, address, phone, timezone')
        .eq('slug', slug)
        .maybeSingle();
      if (error) fail(error);
      if (!data) throw new ApiError('Restaurant not found.', true);
      return data as Restaurant;
    },

    async getSettings(restaurantId: string): Promise<RestaurantSettings> {
      const { data, error } = await sb
        .from('restaurant_settings')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (error) fail(error);
      if (!data) throw new ApiError('Restaurant settings not found.', true);
      return data as RestaurantSettings;
    },

    async isOpenNow(restaurantId: string): Promise<boolean> {
      const { data, error } = await sb.rpc('restaurant_open_now', { p_restaurant_id: restaurantId });
      if (error) fail(error);
      return data === true;
    },

    // ---------- menu ----------
    async getCategories(restaurantId: string): Promise<Category[]> {
      const { data, error } = await sb
        .from('categories')
        .select('id, restaurant_id, name, sort_order, is_active')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) fail(error);
      return (data ?? []) as Category[];
    },

    /** Only items the owner marked as available. */
    async getAvailableProducts(restaurantId: string): Promise<Product[]> {
      const { data, error } = await sb
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) fail(error);
      return (data ?? []) as Product[];
    },

    async getProduct(id: string): Promise<Product | null> {
      const { data, error } = await sb.from('products').select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      return (data as Product | null) ?? null;
    },

    /** For re-checking cart lines (includes unavailable items so we can flag them). */
    async getProductsByIds(ids: string[]): Promise<Product[]> {
      if (ids.length === 0) return [];
      const { data, error } = await sb.from('products').select('*').in('id', ids);
      if (error) fail(error);
      return (data ?? []) as Product[];
    },

    // ---------- orders ----------
    async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
      const { data, error } = await sb.rpc('place_order', {
        p_restaurant_id: input.restaurantId,
        p_items: input.items,
        p_customer_name: input.customerName,
        p_customer_phone: input.customerPhone,
        p_house_no: input.houseNo,
        p_street_locality: input.streetLocality,
        p_landmark: input.landmark,
        p_city: input.city,
        p_state: input.state,
        p_pincode: input.pincode,
        p_instructions: input.instructions,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) fail(error);
      return data as PlaceOrderResult;
    },

    async getMyOrders(): Promise<OrderSummary[]> {
      const { data, error } = await sb
        .from('orders')
        .select('id, order_number, status, total, placed_at, order_items(product_name, quantity)')
        .order('placed_at', { ascending: false })
        .limit(100);
      if (error) fail(error);
      return (data ?? []) as unknown as OrderSummary[];
    },

    async getOrder(id: string): Promise<OrderDetail | null> {
      const { data, error } = await sb
        .from('orders')
        .select('*, order_items(*), order_status_history(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) fail(error);
      if (!data) return null;
      const order = data as unknown as OrderDetail;
      order.order_status_history = [...(order.order_status_history ?? [])].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
      );
      return order;
    },

    async cancelOrder(orderId: string, reason?: string): Promise<void> {
      const { error } = await sb.rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: 'cancelled',
        p_reason: reason ?? null,
      });
      if (error) fail(error);
    },

    // ---------- profile & addresses ----------
    async getProfile(userId: string): Promise<Profile | null> {
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .eq('id', userId)
        .maybeSingle();
      if (error) fail(error);
      return (data as Profile | null) ?? null;
    },

    async updateProfile(userId: string, patch: { full_name: string; phone: string }): Promise<void> {
      const { error } = await sb.from('profiles').update(patch).eq('id', userId);
      if (error) fail(error);
    },

    async getAddresses(): Promise<SavedAddress[]> {
      const { data, error } = await sb
        .from('customer_addresses')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) fail(error);
      return (data ?? []) as SavedAddress[];
    },

    async saveAddress(userId: string, a: NewAddress): Promise<void> {
      // Avoid piling up duplicates of the same address
      const { data: existing, error: e1 } = await sb
        .from('customer_addresses')
        .select('id')
        .eq('house_no', a.house_no)
        .eq('street_locality', a.street_locality)
        .eq('pincode', a.pincode)
        .limit(1);
      if (e1) fail(e1);
      if (existing && existing.length > 0) return;
      const { error } = await sb.from('customer_addresses').insert({ user_id: userId, ...a });
      if (error) fail(error);
    },

    async deleteAddress(id: string): Promise<void> {
      const { error } = await sb.from('customer_addresses').delete().eq('id', id);
      if (error) fail(error);
    },
  };
}

export type Api = ReturnType<typeof createApi>;
