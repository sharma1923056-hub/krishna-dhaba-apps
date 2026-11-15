-- =====================================================================
-- Krishna Dhaba  |  Security + order-workflow test (OPTIONAL, safe to run)
--
-- Run AFTER migrations 001-004 and seed.sql.
-- It creates temporary users/orders, tries to break the rules as an
-- anonymous visitor, two customers and an owner, and then ROLLS EVERYTHING
-- BACK on purpose. Expected result is an "error" whose message starts with:
--     ALL <n> CHECKS PASSED (everything rolled back)
-- Any message starting with FAIL means something is wrong.
-- =====================================================================
do $test$
declare
  v_r      uuid;
  v_owner  uuid := gen_random_uuid();
  v_a      uuid := gen_random_uuid();
  v_b      uuid := gen_random_uuid();
  v_dal    uuid;
  v_naan   uuid;
  v_cat    uuid;
  v_json   jsonb;
  v_json2  jsonb;
  v_o1     uuid;
  v_o2     uuid;
  v_o3     uuid;
  v_stats  jsonb;
  v_sql    text;
  v_n      integer;
  v_txt    text;
begin
  -- ---------- temporary helper functions (rolled back with everything else) ----------
  execute $h$
    create function public._t_pass() returns void language plpgsql as $f$
    begin
      perform set_config('kd.n', (coalesce(nullif(current_setting('kd.n', true), ''), '0')::int + 1)::text, true);
    end $f$ $h$;

  execute $h$
    create function public._t_as(p_uid uuid, p_role text) returns void language plpgsql as $f$
    begin
      perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'role', p_role)::text, true);
      execute 'reset role';
      execute format('set local role %I', p_role);
    end $f$ $h$;

  execute $h$
    create function public._t_fails(p_sql text, p_label text, p_like text default null)
    returns void language plpgsql as $f$
    declare v_msg text;
    begin
      begin
        execute p_sql;
      exception when others then
        v_msg := sqlerrm;
      end;
      if v_msg is null then
        raise exception 'FAIL (should have been blocked but succeeded): %', p_label;
      end if;
      if p_like is not null and v_msg not ilike p_like then
        raise exception 'FAIL (blocked, but with unexpected error) %: %', p_label, v_msg;
      end if;
      perform public._t_pass();
    end $f$ $h$;

  -- For UPDATE/DELETE: row-level security makes forbidden rows invisible, so the statement
  -- may "succeed" while changing 0 rows. Blocked = it errors OR it affects 0 rows.
  execute $h$
    create function public._t_blocked(p_sql text, p_label text)
    returns void language plpgsql as $f$
    declare v_rows bigint := -1; v_err text;
    begin
      begin
        execute p_sql;
        get diagnostics v_rows = row_count;
      exception when others then
        v_err := sqlerrm;
      end;
      if v_err is null and v_rows <> 0 then
        raise exception 'FAIL (change went through, % row(s)): %', v_rows, p_label;
      end if;
      perform public._t_pass();
    end $f$ $h$;

  execute $h$
    create function public._t_count(p_sql text, p_expected integer, p_label text)
    returns void language plpgsql as $f$
    declare v_n integer;
    begin
      execute 'select count(*) from (' || p_sql || ') q' into v_n;
      if v_n is distinct from p_expected then
        raise exception 'FAIL %: expected % rows, got %', p_label, p_expected, v_n;
      end if;
      perform public._t_pass();
    end $f$ $h$;

  execute $h$
    create function public._t_eq(p_actual text, p_expected text, p_label text)
    returns void language plpgsql as $f$
    begin
      if p_actual is distinct from p_expected then
        raise exception 'FAIL %: expected [%], got [%]', p_label, p_expected, p_actual;
      end if;
      perform public._t_pass();
    end $f$ $h$;

  -- Builds a place_order(...) call. Items are [{"product_id":..,"quantity":..}]
  execute $h$
    create function public._t_place_sql(p_restaurant uuid, p_items text,
        p_phone text default '9876543210', p_pin text default '110001', p_key text default null)
    returns text language sql as $f$
      select format(
        'select public.place_order(%L::uuid, %L::jsonb, ''Test Customer'', %L, ''12'', ''MG Road'', ''Near temple'', ''New Delhi'', ''Delhi'', %L, ''No onions'', %L)',
        p_restaurant, p_items, p_phone, p_pin, p_key)
    $f$ $h$;

  -- ---------- setup (as the admin/postgres role) ----------
  select id into v_r from public.restaurants where slug = 'krishna-dhaba';
  if v_r is null then raise exception 'FAIL: run seed.sql first (restaurant not found)'; end if;

  insert into auth.users (id, email) values
    (v_owner, 'test-owner@example.invalid'),
    (v_a,     'test-a@example.invalid'),
    (v_b,     'test-b@example.invalid');

  perform public._t_count(format('select 1 from public.profiles where id in (%L, %L, %L)', v_owner, v_a, v_b),
                          3, 'profile auto-created for new users');

  insert into public.restaurant_staff (restaurant_id, user_id, role) values (v_r, v_owner, 'owner');

  -- Make the restaurant open "24 hours" so the test does not depend on the time of day
  update public.restaurant_settings
     set is_accepting_orders = true, opening_time = '00:00', closing_time = '00:00',
         delivery_fee = 30, min_order_amount = 100, serviceable_pincodes = '{}'
   where restaurant_id = v_r;

  select id into v_dal  from public.products where restaurant_id = v_r and name = 'Dal Tadka'  and deleted_at is null;
  select id into v_naan from public.products where restaurant_id = v_r and name = 'Butter Naan' and deleted_at is null;
  select id into v_cat  from public.categories where restaurant_id = v_r and name = 'Breads' and deleted_at is null;
  if v_dal is null or v_naan is null then raise exception 'FAIL: seed products missing (run seed.sql)'; end if;

  -- =========================================================
  -- A. Anonymous visitor (not logged in)
  -- =========================================================
  perform public._t_as(null, 'anon');
  perform public._t_count('select 1 from public.products', 9, 'anon can browse the menu');
  perform public._t_count('select 1 from public.restaurant_settings', 1, 'anon can read restaurant settings');
  perform public._t_eq(public.restaurant_open_now(v_r)::text, 'true', 'anon can check open status');
  perform public._t_fails('select 1 from public.orders', 'anon cannot read orders');
  perform public._t_fails('select 1 from public.customer_addresses', 'anon cannot read addresses');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal)),
                          'anon cannot place orders');

  -- =========================================================
  -- B. Customer A places orders
  -- =========================================================
  perform public._t_as(v_a, 'authenticated');

  -- Order 1: 2 x Dal (130) + 1 x Naan (40) = 300 + delivery 30 = 330
  execute public._t_place_sql(v_r,
      format('[{"product_id":"%s","quantity":2},{"product_id":"%s","quantity":1}]', v_dal, v_naan),
      '9876543210', '110001', 'key-1') into v_json;
  v_o1 := (v_json ->> 'order_id')::uuid;
  perform public._t_eq(v_json ->> 'subtotal', '300.00', 'server computed subtotal');
  perform public._t_eq(v_json ->> 'total',    '330.00', 'server computed total incl. delivery fee');
  perform public._t_eq(v_json ->> 'status',   'pending', 'new order starts as pending');

  -- Retrying the same checkout (same key) must not create a duplicate
  execute public._t_place_sql(v_r,
      format('[{"product_id":"%s","quantity":2},{"product_id":"%s","quantity":1}]', v_dal, v_naan),
      '9876543210', '110001', 'key-1') into v_json2;
  perform public._t_eq(v_json2 ->> 'order_id', v_json ->> 'order_id', 'idempotent retry returns same order');
  perform public._t_count('select 1 from public.orders', 1, 'no duplicate order was created');

  -- Validation failures
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":0}]', v_dal)),
                          'quantity 0 rejected', '%quantity%');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', gen_random_uuid())),
                          'unknown product rejected', '%no longer available%');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_naan)),
                          'below minimum order rejected', '%Minimum order%');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '12345'),
                          'bad phone rejected', '%mobile%');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '12'),
                          'bad PIN rejected', '%PIN%');
  perform public._t_fails(public._t_place_sql(v_r, '[]'), 'empty cart rejected', '%cart%');

  -- What A can see
  perform public._t_count('select 1 from public.orders', 1, 'A sees own order');
  perform public._t_count('select 1 from public.order_items', 2, 'A sees own order items');
  perform public._t_count('select 1 from public.order_status_history', 1, 'A sees own order history');

  -- A tries to cheat / reach admin features
  perform public._t_blocked(format('update public.orders set status = ''delivered'' where id = %L', v_o1),
                          'A cannot change order status directly');
  perform public._t_blocked(format('update public.orders set total = 1 where id = %L', v_o1),
                          'A cannot change order total directly');
  perform public._t_blocked(format('delete from public.orders where id = %L', v_o1), 'A cannot delete orders');
  perform public._t_blocked(format('update public.order_items set unit_price = 1 where order_id = %L', v_o1),
                          'A cannot change item prices on orders');
  perform public._t_blocked(format('update public.products set price = 1 where id = %L', v_dal),
                          'A cannot change menu prices');
  perform public._t_fails(format('insert into public.categories (restaurant_id, name) values (%L, ''Hack'')', v_r),
                          'A cannot create categories');
  perform public._t_blocked(format('update public.restaurant_settings set delivery_fee = 0 where restaurant_id = %L', v_r),
                          'A cannot change restaurant settings');
  perform public._t_fails(format('insert into public.restaurant_staff (restaurant_id, user_id, role) values (%L, %L, ''owner'')', v_r, v_a),
                          'A cannot make themselves staff');
  perform public._t_fails(format('select public.update_order_status(%L, ''confirmed'')', v_o1),
                          'A cannot confirm own order', '%not allowed%');
  perform public._t_fails(format('select public.dashboard_stats(%L)', v_r), 'A cannot open dashboard', '%Not allowed%');
  perform public._t_count('select 1 from public.restaurant_staff', 0, 'A sees no staff memberships');

  -- A's private address book
  execute format($q$insert into public.customer_addresses
      (user_id, recipient_name, phone, house_no, street_locality, city, state, pincode, is_default)
      values (%L, 'A', '9876543210', '1', 'Street', 'Delhi', 'Delhi', '110001', true)$q$, v_a);
  perform public._t_count('select 1 from public.customer_addresses', 1, 'A sees own address');

  -- =========================================================
  -- C. Customer B tries to spy on / interfere with A
  -- =========================================================
  perform public._t_as(v_b, 'authenticated');
  perform public._t_count('select 1 from public.orders', 0, 'B cannot see A''s orders');
  perform public._t_count('select 1 from public.order_items', 0, 'B cannot see A''s items');
  perform public._t_count('select 1 from public.customer_addresses', 0, 'B cannot see A''s addresses');
  perform public._t_fails(format('select public.update_order_status(%L, ''cancelled'', ''x'')', v_o1),
                          'B cannot cancel A''s order', '%Order not found%');
  perform public._t_fails(format($q$insert into public.customer_addresses
      (user_id, recipient_name, phone, house_no, street_locality, city, state, pincode)
      values (%L, 'B', '9876543210', '1', 'Street', 'Delhi', 'Delhi', '110001')$q$, v_a),
      'B cannot write into A''s address book');

  -- =========================================================
  -- D. Owner runs the order through its life
  -- =========================================================
  perform public._t_as(v_owner, 'authenticated');
  perform public._t_count('select 1 from public.restaurant_staff', 1, 'owner sees own membership');
  perform public._t_count('select 1 from public.orders', 1, 'owner sees incoming order');
  perform public._t_count('select 1 from public.order_items', 2, 'owner sees order items');
  perform public._t_count('select 1 from public.customer_addresses', 0, 'owner cannot read customers'' address books');

  -- invalid jumps
  perform public._t_fails(format('select public.update_order_status(%L, ''delivered'')', v_o1),
                          'cannot skip pending -> delivered', '%not allowed%');
  perform public._t_fails(format('select public.update_order_status(%L, ''cancelled'')', v_o1),
                          'cancel needs a reason', '%reason%');
  perform public._t_blocked(format('update public.orders set status = ''delivered'' where id = %L', v_o1),
                          'owner cannot bypass the status function');

  -- happy path
  perform public.update_order_status(v_o1, 'confirmed');
  perform public.update_order_status(v_o1, 'preparing');
  perform public.update_order_status(v_o1, 'ready_for_dispatch');
  perform public.update_order_status(v_o1, 'out_for_delivery');
  perform public.update_order_status(v_o1, 'delivered');
  perform public._t_count(format('select 1 from public.order_status_history where order_id = %L', v_o1), 6,
                          'history recorded every step');
  perform public._t_fails(format('select public.update_order_status(%L, ''cancelled'', ''oops'')', v_o1),
                          'delivered order cannot be cancelled', '%not allowed%');

  v_stats := public.dashboard_stats(v_r);
  perform public._t_eq(v_stats ->> 'completed', '1', 'dashboard: completed');
  perform public._t_eq(v_stats ->> 'overall_sales', '330.00', 'dashboard: overall sales');
  perform public._t_eq(v_stats ->> 'today_sales', '330.00', 'dashboard: today''s sales');

  execute format('select sales::text from public.sales_by_period(%L, ''day'', current_date - 1, current_date + 1)', v_r) into v_txt;
  perform public._t_eq(v_txt, '330.00', 'sales report by day');
  execute format('select product_name || ''='' || quantity_sold from public.top_products(%L, current_date - 1, current_date + 1, 5) limit 1', v_r) into v_txt;
  perform public._t_eq(v_txt, 'Dal Tadka=2', 'most popular item');

  -- menu management
  execute format('update public.products set price = 999 where id = %L', v_dal);
  perform public._t_count(format('select 1 from public.products where id = %L and price = 999', v_dal), 1, 'owner can change prices');
  execute format('update public.restaurants set name = ''Krishna Dhaba'' where id = %L', v_r);
  perform public._t_blocked(format('update public.restaurants set slug = ''x'' where id = %L', v_r), 'owner cannot change slug');
  perform public._t_fails(format('update public.categories set deleted_at = now() where id = %L', v_cat),
                          'cannot delete a category that still has items', '%still has menu items%');

  -- storage folder permission
  perform public._t_eq(public.can_manage_storage_path(v_r::text || '/pic.jpg')::text, 'true', 'owner may upload into restaurant folder');
  perform public._t_eq(public.can_manage_storage_path('garbage/pic.jpg')::text, 'false', 'bad folder name denied');

  -- =========================================================
  -- E. Back to customer A: price history, cancel flow, limits, closed shop
  -- =========================================================
  perform public._t_as(v_a, 'authenticated');
  perform public._t_count(format('select 1 from public.order_items where order_id = %L and unit_price = 130', v_o1), 1,
                          'old order keeps the OLD price after menu change');

  -- New price (999) applies to new orders
  execute public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001', 'key-2') into v_json;
  v_o2 := (v_json ->> 'order_id')::uuid;
  perform public._t_eq(v_json ->> 'subtotal', '999.00', 'new order uses the new price');

  -- customer cancels own pending order
  execute format('select public.update_order_status(%L, ''cancelled'')', v_o2);
  perform public._t_count(format('select 1 from public.orders where id = %L and status = ''cancelled'' and cancelled_by = ''customer''', v_o2),
                          1, 'customer can cancel a pending order');
  perform public._t_fails(format('select public.update_order_status(%L, ''cancelled'')', v_o2),
                          'cannot cancel twice', '%not allowed%');

  -- owner cancels with reason; customer cannot cancel once confirmed
  execute public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001', 'key-3') into v_json;
  v_o3 := (v_json ->> 'order_id')::uuid;
  perform public._t_as(v_owner, 'authenticated');
  perform public.update_order_status(v_o3, 'confirmed');
  perform public._t_as(v_a, 'authenticated');
  perform public._t_fails(format('select public.update_order_status(%L, ''cancelled'')', v_o3),
                          'customer cannot cancel after confirmation', '%not allowed%');
  perform public._t_as(v_owner, 'authenticated');
  perform public.update_order_status(v_o3, 'cancelled', 'Out of stock');
  perform public._t_count(format('select 1 from public.orders where id = %L and cancel_reason = ''Out of stock'' and cancelled_by = ''staff''', v_o3),
                          1, 'owner cancellation stores reason');

  -- anti-spam: max 3 pending orders
  perform public._t_as(v_a, 'authenticated');
  execute public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001', 'p1') into v_json;
  execute public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001', 'p2') into v_json;
  execute public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001', 'p3') into v_json;
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001', 'p4'),
                          '4th pending order blocked', '%3 orders waiting%');

  -- Out-of-area PIN and closed restaurant (admin role changes settings for the test)
  reset role;
  update public.restaurant_settings set serviceable_pincodes = array['110099'] where restaurant_id = v_r;
  update public.orders set status = 'cancelled', cancel_reason = 't', cancelled_by = 'staff'
   where customer_id = v_a and status = 'pending';
  perform public._t_as(v_a, 'authenticated');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal), '9876543210', '110001'),
                          'out-of-area PIN blocked', '%do not deliver%');
  reset role;
  update public.restaurant_settings set serviceable_pincodes = '{}', is_accepting_orders = false where restaurant_id = v_r;
  perform public._t_as(v_a, 'authenticated');
  perform public._t_fails(public._t_place_sql(v_r, format('[{"product_id":"%s","quantity":1}]', v_dal)),
                          'closed restaurant blocks orders', '%not accepting orders%');
  perform public._t_eq(public.restaurant_open_now(v_r)::text, 'false', 'open-status reports closed');

  -- ---------- report ----------
  reset role;
  raise exception 'ALL % CHECKS PASSED (everything rolled back)', current_setting('kd.n');
end
$test$;
