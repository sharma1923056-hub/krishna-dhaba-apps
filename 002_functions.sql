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
