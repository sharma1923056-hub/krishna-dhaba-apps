export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
}

export interface RestaurantSettings {
  restaurant_id: string;
  is_accepting_orders: boolean;
  opening_time: string; // "10:00:00"
  closing_time: string;
  delivery_fee: number;
  min_order_amount: number;
  serviceable_pincodes: string[];
  currency: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_path: string | null;
  is_available: boolean;
  is_popular: boolean;
  is_veg: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface SavedAddress {
  id: string;
  user_id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  house_no: string;
  street_locality: string;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export interface NewAddress {
  recipient_name: string;
  phone: string;
  house_no: string;
  street_locality: string;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface StatusHistoryRow {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason: string | null;
  created_at: string;
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  placed_at: string;
  order_items: { product_name: string; quantity: number }[];
}

export interface OrderDetail {
  id: string;
  order_number: string;
  restaurant_id: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  delivery_house_no: string;
  delivery_street_locality: string;
  delivery_landmark: string | null;
  delivery_city: string;
  delivery_state: string;
  delivery_pincode: string;
  delivery_instructions: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  cancel_reason: string | null;
  cancelled_by: 'customer' | 'staff' | null;
  placed_at: string;
  delivered_at: string | null;
  order_items: OrderItem[];
  order_status_history: StatusHistoryRow[];
}

export interface PlaceOrderInput {
  restaurantId: string;
  items: { product_id: string; quantity: number }[];
  customerName: string;
  customerPhone: string;
  houseNo: string;
  streetLocality: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  instructions: string;
  idempotencyKey: string;
}

export interface PlaceOrderResult {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  placed_at: string;
}
