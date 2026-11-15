-- =====================================================================
-- Krishna Dhaba  |  Migration 003: Row Level Security + privileges
-- Principle: deny everything, then open only what each role needs.
-- =====================================================================

-- ---------- 1. Turn RLS on for every table ----------
alter table public.profiles              enable row level security;
alter table public.restaurants           enable row level security;
alter table public.restaurant_staff      enable row level security;
alter table public.restaurant_settings   enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.customer_addresses    enable row level security;
alter table public.order_counters        enable row level security;  -- no policies: only server functions touch it
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.push_tokens           enable row level security;

-- ---------- 2. Remove all default table privileges, then grant only what is needed ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Public menu / restaurant info (customers can browse before and after login)
grant select on public.restaurants, public.restaurant_settings,
                public.categories, public.products to anon, authenticated;

-- Owner edits restaurant info (only these columns)
grant update (name, logo_url, address, phone) on public.restaurants to authenticated;
grant update (is_accepting_orders, opening_time, closing_time, delivery_fee,
              min_order_amount, serviceable_pincodes) on public.restaurant_settings to authenticated;

-- Staff manage the menu (no DELETE: removal is a soft delete via deleted_at)
grant insert, update on public.categories, public.products to authenticated;

-- A signed-in user's own data
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant select on public.restaurant_staff to authenticated;

-- Orders are READ-ONLY from the apps; all writes go through place_order / update_order_status
grant select on public.orders, public.order_items, public.order_status_history to authenticated;

-- ---------- 3. Policies ----------
-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- restaurants
drop policy if exists restaurants_select_public on public.restaurants;
create policy restaurants_select_public on public.restaurants
  for select to anon, authenticated using (is_active);

drop policy if exists restaurants_update_owner on public.restaurants;
create policy restaurants_update_owner on public.restaurants
  for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

-- restaurant_staff: a user can see only their own memberships (used for the owner-app login check)
drop policy if exists staff_select_own on public.restaurant_staff;
create policy staff_select_own on public.restaurant_staff
  for select to authenticated using (user_id = (select auth.uid()));

-- restaurant_settings
drop policy if exists settings_select_public on public.restaurant_settings;
create policy settings_select_public on public.restaurant_settings
  for select to anon, authenticated using (true);

drop policy if exists settings_update_owner on public.restaurant_settings;
create policy settings_update_owner on public.restaurant_settings
  for update to authenticated
  using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));

-- categories
drop policy if exists categories_select_public on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated using (deleted_at is null);

drop policy if exists categories_select_staff on public.categories;
create policy categories_select_staff on public.categories
  for select to authenticated using (public.is_staff(restaurant_id));

drop policy if exists categories_insert_staff on public.categories;
create policy categories_insert_staff on public.categories
  for insert to authenticated with check (public.is_staff(restaurant_id));

drop policy if exists categories_update_staff on public.categories;
create policy categories_update_staff on public.categories
  for update to authenticated
  using (public.is_staff(restaurant_id)) with check (public.is_staff(restaurant_id));

-- products
-- NOTE: customers can read non-deleted items (including unavailable ones) so that
-- "item became unavailable" changes reach their phone in real time. The customer
-- app only DISPLAYS items where is_available = true, and place_order re-checks on the server.
drop policy if exists products_select_public on public.products;
create policy products_select_public on public.products
  for select to anon, authenticated using (deleted_at is null);

drop policy if exists products_select_staff on public.products;
create policy products_select_staff on public.products
  for select to authenticated using (public.is_staff(restaurant_id));

drop policy if exists products_insert_staff on public.products;
create policy products_insert_staff on public.products
  for insert to authenticated with check (public.is_staff(restaurant_id));

drop policy if exists products_update_staff on public.products;
create policy products_update_staff on public.products
  for update to authenticated
  using (public.is_staff(restaurant_id)) with check (public.is_staff(restaurant_id));

-- customer_addresses: strictly private to each customer
drop policy if exists addresses_own on public.customer_addresses;
create policy addresses_own on public.customer_addresses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- push_tokens: each user manages only their own device tokens
drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- orders: the customer who placed it, or staff of that restaurant
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_staff(restaurant_id));

-- order_items / order_status_history: visible exactly when the parent order is visible
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));

drop policy if exists order_history_select on public.order_status_history;
create policy order_history_select on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));
