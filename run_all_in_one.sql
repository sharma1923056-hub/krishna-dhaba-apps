
-- ########## migrations/001_schema.sql ##########
-- =====================================================================
-- Krishna Dhaba  |  Migration 001: schema (tables, indexes, triggers)
-- Safe to re-run: uses IF NOT EXISTS / DROP ... IF EXISTS where possible.
-- =====================================================================

-- ---------- Enums ----------
do $$ begin
  create type public.order_status as enum (
    'pending', 'confirmed', 'preparing', 'ready_for_dispatch',
    'out_for_delivery', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_role as enum ('owner', 'staff');
exception when duplicate_object then null; end $$;

-- ---------- Generic updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- restaurants ----------
create table if not exists public.restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 100),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  order_prefix  text not null default 'ORD' check (order_prefix ~ '^[A-Z0-9]{2,6}$'),
  logo_url      text,
  address       text,
  phone         text,
  timezone      text not null default 'Asia/Kolkata',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- restaurant_staff (the ONLY source of admin authority) ----------
create table if not exists public.restaurant_staff (
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           public.staff_role not null default 'staff',
  created_at     timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index if not exists restaurant_staff_user_idx on public.restaurant_staff (user_id);

-- ---------- restaurant_settings (1:1 with restaurants) ----------
create table if not exists public.restaurant_settings (
  restaurant_id        uuid primary key references public.restaurants (id) on delete cascade,
  is_accepting_orders  boolean not null default true,
  opening_time         time not null default '10:00',
  closing_time         time not null default '23:00',   -- if earlier than opening_time, hours run past midnight
  delivery_fee         numeric(10,2) not null default 0 check (delivery_fee >= 0),
  min_order_amount     numeric(10,2) not null default 0 check (min_order_amount >= 0),
  serviceable_pincodes text[] not null default '{}',     -- empty = deliver anywhere
  currency             text not null default 'INR',
  updated_at           timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  deleted_at     timestamptz,                             -- soft delete
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, restaurant_id)
);
create unique index if not exists categories_unique_name_idx
  on public.categories (restaurant_id, lower(name)) where deleted_at is null;

-- ---------- products ----------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  category_id    uuid not null,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  description    text check (description is null or char_length(description) <= 1000),
  price          numeric(10,2) not null check (price >= 0),
  image_path     text,                                    -- path inside the 'menu-images' storage bucket
  is_available   boolean not null default true,
  is_popular     boolean not null default false,
  is_veg         boolean not null default true,
  sort_order     integer not null default 0,
  deleted_at     timestamptz,                             -- soft delete (old orders keep their snapshots)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- a product's category must belong to the same restaurant
  foreign key (category_id, restaurant_id) references public.categories (id, restaurant_id)
);
create index if not exists products_menu_idx
  on public.products (restaurant_id, category_id) where deleted_at is null;

-- ---------- customer_addresses (a customer's private address book) ----------
create table if not exists public.customer_addresses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  label           text,
  recipient_name  text not null,
  phone           text not null check (phone ~ '^[0-9]{10}$'),
  house_no        text not null,
  street_locality text not null,
  landmark        text,
  city            text not null,
  state           text not null,
  pincode         text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists customer_addresses_user_idx on public.customer_addresses (user_id);
create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (user_id) where is_default;

-- ---------- order_counters (per restaurant, per day; used for readable order numbers) ----------
create table if not exists public.order_counters (
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  order_date     date not null,
  last_number    integer not null default 0,
  primary key (restaurant_id, order_date)
);

-- ---------- orders ----------
create table if not exists public.orders (
  id                       uuid primary key default gen_random_uuid(),
  order_number             text not null,
  restaurant_id            uuid not null references public.restaurants (id) on delete restrict,
  customer_id              uuid references auth.users (id) on delete set null,
  status                   public.order_status not null default 'pending',

  -- snapshot of customer + address at the time of ordering
  customer_name            text not null,
  customer_phone           text not null,
  delivery_house_no        text not null,
  delivery_street_locality text not null,
  delivery_landmark        text,
  delivery_city            text not null,
  delivery_state           text not null,
  delivery_pincode         text not null,
  delivery_instructions    text,

  subtotal                 numeric(10,2) not null check (subtotal >= 0),
  delivery_fee             numeric(10,2) not null check (delivery_fee >= 0),
  total                    numeric(10,2) not null check (total >= 0),
  check (total = subtotal + delivery_fee),

  payment_method           text not null default 'cod' check (payment_method in ('cod')),
  payment_status           text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),

  cancel_reason            text,
  cancelled_by             text check (cancelled_by in ('customer', 'staff')),
  idempotency_key          text,

  placed_at                timestamptz not null default now(),
  delivered_at             timestamptz,
  updated_at               timestamptz not null default now(),

  unique (restaurant_id, order_number),
  unique (customer_id, idempotency_key)
);
create index if not exists orders_restaurant_placed_idx on public.orders (restaurant_id, placed_at desc);
create index if not exists orders_customer_placed_idx   on public.orders (customer_id, placed_at desc);
create index if not exists orders_restaurant_status_idx on public.orders (restaurant_id, status);
create index if not exists orders_phone_idx             on public.orders (customer_phone);

-- ---------- order_items (price + name are SNAPSHOTS) ----------
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  product_name  text not null,
  unit_price    numeric(10,2) not null check (unit_price >= 0),
  quantity      integer not null check (quantity between 1 and 50),
  line_total    numeric(10,2) not null check (line_total >= 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------- order_status_history ----------
create table if not exists public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------- push_tokens ----------
create table if not exists public.push_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  expo_push_token  text not null unique,
  app              text not null check (app in ('customer', 'owner')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'restaurants', 'restaurant_settings', 'categories',
    'products', 'customer_addresses', 'orders', 'push_tokens'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Block soft-deleting a category that still has live items ----------
create or replace function public.prevent_nonempty_category_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (
      select 1 from public.products p
      where p.category_id = new.id and p.deleted_at is null
    ) then
      raise exception 'This category still has menu items. Move or delete them first.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_prevent_nonempty_delete on public.categories;
create trigger categories_prevent_nonempty_delete
  before update of deleted_at on public.categories
  for each row execute function public.prevent_nonempty_category_delete();

-- ---------- Auto-create a profile row when someone signs up ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ########## migrations/002_functions.sql ##########
-- =====================================================================
-- Krishna Dhaba  |  Migration 002: functions (RPC)
-- All order writes go through these functions. Apps never write
-- directly to orders / order_items / order_status_history.
-- =====================================================================

-- ---------- Authorization helpers ----------
create or replace function public.is_staff(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = p_restaurant_id and s.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = p_restaurant_id
      and s.user_id = (select auth.uid())
      and s.role = 'owner'
  );
$$;

-- ---------- Is the restaurant open right now? (restaurant's own timezone) ----------
create or replace function public.restaurant_open_now(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      r.is_active
      and s.is_accepting_orders
      and case
        when s.opening_time = s.closing_time then true   -- open 24 hours
        when s.opening_time < s.closing_time then
          (now() at time zone r.timezone)::time >= s.opening_time
          and (now() at time zone r.timezone)::time < s.closing_time
        else                                              -- runs past midnight
          (now() at time zone r.timezone)::time >= s.opening_time
          or (now() at time zone r.timezone)::time < s.closing_time
      end
    from public.restaurants r
    join public.restaurant_settings s on s.restaurant_id = r.id
    where r.id = p_restaurant_id
  ), false);
$$;

-- ---------- Internal: compact JSON describing an order ----------
create or replace function public._order_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id',     o.id,
    'order_number', o.order_number,
    'status',       o.status,
    'subtotal',     o.subtotal,
    'delivery_fee', o.delivery_fee,
    'total',        o.total,
    'placed_at',    o.placed_at
  )
  from public.orders o
  where o.id = p_order_id;
$$;

-- =====================================================================
-- place_order: validates everything and computes all prices on the server.
-- p_items example: [{"product_id": "<uuid>", "quantity": 2}, ...]
-- p_idempotency_key: any unique string per checkout attempt; retrying
-- with the same key returns the same order instead of creating a duplicate.
-- =====================================================================
create or replace function public.place_order(
  p_restaurant_id    uuid,
  p_items            jsonb,
  p_customer_name    text,
  p_customer_phone   text,
  p_house_no         text,
  p_street_locality  text,
  p_landmark         text,
  p_city             text,
  p_state            text,
  p_pincode          text,
  p_instructions     text default null,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_existing_id uuid;
  v_restaurant  public.restaurants;
  v_settings    public.restaurant_settings;
  v_requested   integer;
  v_resolved    integer;
  v_subtotal    numeric(10,2);
  v_order_id    uuid;
  v_order_no    text;
  v_seq         integer;
  v_local_date  date;
begin
  if v_uid is null then
    raise exception 'Please sign in to place an order.';
  end if;

  -- Retry of an already-placed order? Return it, do not duplicate.
  if p_idempotency_key is not null then
    select o.id into v_existing_id
    from public.orders o
    where o.customer_id = v_uid and o.idempotency_key = p_idempotency_key;
    if found then
      return public._order_json(v_existing_id);
    end if;
  end if;

  -- ----- Input validation -----
  p_customer_name   := btrim(coalesce(p_customer_name, ''));
  p_customer_phone  := regexp_replace(coalesce(p_customer_phone, ''), '[\s-]', '', 'g');
  p_house_no        := btrim(coalesce(p_house_no, ''));
  p_street_locality := btrim(coalesce(p_street_locality, ''));
  p_landmark        := nullif(btrim(coalesce(p_landmark, '')), '');
  p_city            := btrim(coalesce(p_city, ''));
  p_state           := btrim(coalesce(p_state, ''));
  p_pincode         := btrim(coalesce(p_pincode, ''));
  p_instructions    := nullif(btrim(coalesce(p_instructions, '')), '');

  if char_length(p_customer_name) not between 2 and 100 then
    raise exception 'Please enter a valid name.';
  end if;
  if p_customer_phone !~ '^[0-9]{10}$' then
    raise exception 'Please enter a valid 10-digit mobile number.';
  end if;
  if char_length(p_house_no) not between 1 and 100
     or char_length(p_street_locality) not between 1 and 200
     or char_length(p_city) not between 1 and 100
     or char_length(p_state) not between 1 and 100 then
    raise exception 'Please complete your delivery address.';
  end if;
  if p_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Please enter a valid 6-digit PIN code.';
  end if;
  if char_length(coalesce(p_landmark, '')) > 200 or char_length(coalesce(p_instructions, '')) > 500 then
    raise exception 'Landmark or delivery instructions are too long.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Your cart is empty or invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce((x ->> 'quantity')::integer, 0) not between 1 and 50
       or (x ->> 'product_id') is null
  ) then
    raise exception 'Each item needs a quantity between 1 and 50.';
  end if;

  -- ----- Restaurant checks -----
  select * into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id and r.is_active;
  if not found then
    raise exception 'Restaurant not found.';
  end if;

  select * into v_settings
  from public.restaurant_settings s
  where s.restaurant_id = p_restaurant_id;
  if not found or not public.restaurant_open_now(p_restaurant_id) then
    raise exception '% is currently not accepting orders.', v_restaurant.name;
  end if;

  if coalesce(array_length(v_settings.serviceable_pincodes, 1), 0) > 0
     and not (p_pincode = any (v_settings.serviceable_pincodes)) then
    raise exception 'Sorry, we do not deliver to PIN code % yet.', p_pincode;
  end if;

  -- Anti-spam: limit orders still waiting for the restaurant
  if (select count(*) from public.orders o
      where o.customer_id = v_uid and o.status = 'pending') >= 3 then
    raise exception 'You already have 3 orders waiting for confirmation. Please wait for the restaurant to respond.';
  end if;

  -- ----- Order number: PREFIX-YYMMDD-0001 (restaurant-local date) -----
  v_local_date := (now() at time zone v_restaurant.timezone)::date;
  insert into public.order_counters as c (restaurant_id, order_date, last_number)
  values (p_restaurant_id, v_local_date, 1)
  on conflict (restaurant_id, order_date)
    do update set last_number = c.last_number + 1
  returning c.last_number into v_seq;

  v_order_no := v_restaurant.order_prefix || '-' || to_char(v_local_date, 'YYMMDD')
                || '-' || lpad(v_seq::text, 4, '0');

  -- ----- Create the order (totals fixed after items are priced) -----
  insert into public.orders (
    order_number, restaurant_id, customer_id, status,
    customer_name, customer_phone,
    delivery_house_no, delivery_street_locality, delivery_landmark,
    delivery_city, delivery_state, delivery_pincode, delivery_instructions,
    subtotal, delivery_fee, total, idempotency_key
  ) values (
    v_order_no, p_restaurant_id, v_uid, 'pending',
    p_customer_name, p_customer_phone,
    p_house_no, p_street_locality, p_landmark,
    p_city, p_state, p_pincode, p_instructions,
    0, v_settings.delivery_fee, v_settings.delivery_fee, p_idempotency_key
  )
  returning id into v_order_id;

  -- ----- Items: names and prices come from the DATABASE, never from the app -----
  select count(*) into v_requested
  from (select 1 from jsonb_array_elements(p_items) x group by (x ->> 'product_id')) d;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
  select v_order_id, p.id, p.name, p.price, r.qty, p.price * r.qty
  from (
    select (x ->> 'product_id')::uuid as product_id,
           sum((x ->> 'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) x
    group by 1
  ) r
  join public.products p   on p.id = r.product_id
  join public.categories c on c.id = p.category_id
  where p.restaurant_id = p_restaurant_id
    and p.deleted_at is null
    and p.is_available
    and c.deleted_at is null
    and c.is_active;

  get diagnostics v_resolved = row_count;
  if v_resolved <> v_requested then
    raise exception 'One or more items in your cart are no longer available. Please review your cart.';
  end if;

  select coalesce(sum(i.line_total), 0) into v_subtotal
  from public.order_items i where i.order_id = v_order_id;

  if v_subtotal < v_settings.min_order_amount then
    raise exception 'Minimum order amount is Rs. %.', v_settings.min_order_amount;
  end if;

  update public.orders
     set subtotal = v_subtotal,
         total    = v_subtotal + v_settings.delivery_fee
   where id = v_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'pending', v_uid);

  return public._order_json(v_order_id);
end;
$$;

-- =====================================================================
-- update_order_status
--   Staff:    pending -> confirmed -> preparing -> ready_for_dispatch
--             -> out_for_delivery -> delivered ; or cancel (with reason)
--             at any step before delivered.
--   Customer: may cancel only while the order is still 'pending'.
-- =====================================================================
create or replace function public.update_order_status(
  p_order_id    uuid,
  p_new_status  public.order_status,
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_order   public.orders;
  v_actor   text;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_allowed boolean;
begin
  if v_uid is null then
    raise exception 'Please sign in.';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if public.is_staff(v_order.restaurant_id) then
    v_actor := 'staff';
  elsif v_order.customer_id = v_uid then
    v_actor := 'customer';
  else
    raise exception 'Order not found.';   -- do not reveal that it exists
  end if;

  if v_actor = 'customer' then
    v_allowed := v_order.status = 'pending' and p_new_status = 'cancelled';
  else
    v_allowed := case v_order.status
      when 'pending'            then p_new_status in ('confirmed', 'cancelled')
      when 'confirmed'          then p_new_status in ('preparing', 'cancelled')
      when 'preparing'          then p_new_status in ('ready_for_dispatch', 'cancelled')
      when 'ready_for_dispatch' then p_new_status in ('out_for_delivery', 'cancelled')
      when 'out_for_delivery'   then p_new_status in ('delivered', 'cancelled')
      else false
    end;
  end if;

  if not v_allowed then
    raise exception 'This status change is not allowed (% to %).', v_order.status, p_new_status;
  end if;

  if p_new_status = 'cancelled' then
    if v_actor = 'staff' and v_reason is null then
      raise exception 'Please provide a reason for cancelling this order.';
    end if;
    v_reason := coalesce(v_reason, 'Cancelled by customer');
  else
    v_reason := null;
  end if;

  update public.orders o
     set status        = p_new_status,
         cancel_reason = case when p_new_status = 'cancelled' then v_reason else o.cancel_reason end,
         cancelled_by  = case when p_new_status = 'cancelled' then v_actor  else o.cancelled_by  end,
         delivered_at  = case when p_new_status = 'delivered'  then now()   else o.delivered_at  end,
         payment_status = case when p_new_status = 'delivered' then 'paid'  else o.payment_status end
   where o.id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, p_new_status, v_uid, v_reason);

  return public._order_json(p_order_id);
end;
$$;

-- =====================================================================
-- Reports (staff only). "Sales" = total of DELIVERED orders.
-- Days/weeks/months are in the restaurant's own timezone.
-- =====================================================================
create or replace function public.dashboard_stats(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_result jsonb;
begin
  if not public.is_staff(p_restaurant_id) then
    raise exception 'Not allowed.';
  end if;

  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;

  select jsonb_build_object(
    'total_orders',       count(*),
    'new_orders',         count(*) filter (where (o.placed_at at time zone v_tz)::date = (now() at time zone v_tz)::date),
    'pending',            count(*) filter (where o.status = 'pending'),
    'confirmed',          count(*) filter (where o.status = 'confirmed'),
    'preparing',          count(*) filter (where o.status = 'preparing'),
    'ready_for_dispatch', count(*) filter (where o.status = 'ready_for_dispatch'),
    'out_for_delivery',   count(*) filter (where o.status = 'out_for_delivery'),
    'completed',          count(*) filter (where o.status = 'delivered'),
    'cancelled',          count(*) filter (where o.status = 'cancelled'),
    'today_sales',        coalesce(sum(o.total) filter (
                            where o.status = 'delivered'
                              and (o.placed_at at time zone v_tz)::date = (now() at time zone v_tz)::date), 0),
    'overall_sales',      coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)
  ) into v_result
  from public.orders o
  where o.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

create or replace function public.sales_by_period(
  p_restaurant_id uuid,
  p_granularity   text,        -- 'day' | 'week' | 'month'
  p_from          date,
  p_to            date
)
returns table (
  period_start     date,
  total_orders     bigint,
  delivered_orders bigint,
  cancelled_orders bigint,
  sales            numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.is_staff(p_restaurant_id) then
    raise exception 'Not allowed.';
  end if;
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'Granularity must be day, week or month.';
  end if;

  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;

  return query
  select
    date_trunc(p_granularity, o.placed_at at time zone v_tz)::date,
    count(*),
    count(*) filter (where o.status = 'delivered'),
    count(*) filter (where o.status = 'cancelled'),
    coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and (o.placed_at at time zone v_tz)::date between p_from and p_to
  group by 1
  order by 1;
end;
$$;

create or replace function public.top_products(
  p_restaurant_id uuid,
  p_from          date,
  p_to            date,
  p_limit         integer default 10
)
returns table (
  product_name  text,
  quantity_sold bigint,
  revenue       numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.is_staff(p_restaurant_id) then
    raise exception 'Not allowed.';
  end if;

  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;

  return query
  select i.product_name, sum(i.quantity)::bigint, sum(i.line_total)
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.restaurant_id = p_restaurant_id
    and o.status = 'delivered'
    and (o.placed_at at time zone v_tz)::date between p_from and p_to
  group by i.product_name
  order by 2 desc, 3 desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

-- ---------- Who may call what ----------
revoke all on function public._order_json(uuid) from public, anon, authenticated;

revoke all on function public.is_staff(uuid)           from public, anon;
revoke all on function public.is_owner(uuid)           from public, anon;
revoke all on function public.place_order(uuid, jsonb, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.update_order_status(uuid, public.order_status, text) from public, anon;
revoke all on function public.dashboard_stats(uuid)    from public, anon;
revoke all on function public.sales_by_period(uuid, text, date, date) from public, anon;
revoke all on function public.top_products(uuid, date, date, integer) from public, anon;

grant execute on function public.is_staff(uuid)           to authenticated;
grant execute on function public.is_owner(uuid)           to authenticated;
grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.dashboard_stats(uuid)    to authenticated;
grant execute on function public.sales_by_period(uuid, text, date, date) to authenticated;
grant execute on function public.top_products(uuid, date, date, integer) to authenticated;

-- Public: the customer app shows "Open / Closed" on the home screen
revoke all on function public.restaurant_open_now(uuid) from public;
grant execute on function public.restaurant_open_now(uuid) to anon, authenticated;

-- ########## migrations/003_rls.sql ##########
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

-- ########## migrations/004_storage_realtime.sql ##########
-- =====================================================================
-- Krishna Dhaba  |  Migration 004: image storage + Realtime
-- =====================================================================

-- ---------- Storage bucket for food images and logo ----------
-- Public bucket (anyone can VIEW images); only staff can upload/change/delete.
-- Files must be stored under a folder named after the restaurant id:
--   <restaurant_id>/<filename>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safely checks "is the caller staff of the restaurant named by the first folder?"
create or replace function public.can_manage_storage_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  begin
    v_restaurant_id := ((storage.foldername(p_name))[1])::uuid;
  exception when others then
    return false;
  end;
  return public.is_staff(v_restaurant_id);
end;
$$;

revoke all on function public.can_manage_storage_path(text) from public, anon;
grant execute on function public.can_manage_storage_path(text) to authenticated;

drop policy if exists "menu images are public" on storage.objects;
create policy "menu images are public" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "staff upload menu images" on storage.objects;
create policy "staff upload menu images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and public.can_manage_storage_path(name));

drop policy if exists "staff update menu images" on storage.objects;
create policy "staff update menu images" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and public.can_manage_storage_path(name))
  with check (bucket_id = 'menu-images' and public.can_manage_storage_path(name));

drop policy if exists "staff delete menu images" on storage.objects;
create policy "staff delete menu images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and public.can_manage_storage_path(name));

-- ---------- Realtime ----------
-- Realtime respects the RLS policies above: a customer only receives events
-- for their own orders; staff receive events for their restaurant's orders.
do $$
declare t text;
begin
  foreach t in array array['orders', 'products', 'categories', 'restaurant_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ########## seed.sql ##########
-- =====================================================================
-- Krishna Dhaba  |  Seed data (run once, after migrations 001-004)
-- Safe to re-run. SAMPLE menu only: the owner edits/deletes it in the
-- Owner app. Change delivery fee / hours there too.
-- =====================================================================

insert into public.restaurants (name, slug, order_prefix, timezone)
values ('Krishna Dhaba', 'krishna-dhaba', 'KD', 'Asia/Kolkata')
on conflict (slug) do nothing;

insert into public.restaurant_settings
  (restaurant_id, is_accepting_orders, opening_time, closing_time, delivery_fee, min_order_amount)
select r.id, true, '10:00', '23:00', 30, 100
from public.restaurants r
where r.slug = 'krishna-dhaba'
on conflict (restaurant_id) do nothing;

-- Sample categories
insert into public.categories (restaurant_id, name, sort_order)
select r.id, c.name, c.sort_order
from public.restaurants r
cross join (values
  ('Starters', 1), ('Main Course', 2), ('Breads', 3), ('Beverages', 4)
) as c (name, sort_order)
where r.slug = 'krishna-dhaba'
on conflict do nothing;

-- Sample products (no images yet: upload them from the Owner app)
insert into public.products (restaurant_id, category_id, name, description, price, is_veg, is_popular, sort_order)
select r.id, c.id, p.name, p.description, p.price, p.is_veg, p.is_popular, p.sort_order
from public.restaurants r
join public.categories c on c.restaurant_id = r.id and c.deleted_at is null
join (values
  ('Starters',    'Paneer Tikka',      'Smoky tandoori paneer cubes with mint chutney',     180, true,  true,  1),
  ('Starters',    'Veg Manchurian',    'Crispy veg balls in tangy Indo-Chinese gravy',      140, true,  false, 2),
  ('Main Course', 'Dal Tadka',         'Yellow lentils tempered with garlic and ghee',      130, true,  true,  1),
  ('Main Course', 'Paneer Butter Masala', 'Paneer in rich creamy tomato gravy',             220, true,  true,  2),
  ('Main Course', 'Chicken Curry',     'Home-style dhaba chicken curry',                    260, false, true,  3),
  ('Breads',      'Butter Naan',       'Soft tandoor naan brushed with butter',              40, true,  false, 1),
  ('Breads',      'Tandoori Roti',     'Whole wheat roti baked in tandoor',                  20, true,  false, 2),
  ('Beverages',   'Sweet Lassi',       'Thick chilled sweet curd drink',                     60, true,  false, 1),
  ('Beverages',   'Masala Chaas',      'Spiced buttermilk',                                  40, true,  false, 2)
) as p (category, name, description, price, is_veg, is_popular, sort_order)
  on p.category = c.name
where r.slug = 'krishna-dhaba'
  and not exists (
    select 1 from public.products x
    where x.restaurant_id = r.id and x.name = p.name and x.deleted_at is null
  );
