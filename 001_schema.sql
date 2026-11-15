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
