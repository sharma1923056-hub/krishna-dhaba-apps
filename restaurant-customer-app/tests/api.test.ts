/**
 * Integration test for the Customer app's data layer (src/api).
 * Runs the REAL app code with the REAL supabase-js client against a PostgREST
 * server connected to a database that has the Krishna Dhaba migrations applied.
 *
 * Env: TEST_API_URL (default http://127.0.0.1:3001), TEST_JWT_SECRET, TEST_PSQL (command that runs SQL via stdin)
 */
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { ApiError, createApi } from '../src/api';

const URL = process.env.TEST_API_URL ?? 'http://127.0.0.1:3001';
const SECRET = process.env.TEST_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const PSQL = process.env.TEST_PSQL ?? 'su postgres -c "psql -q -d kd -v ON_ERROR_STOP=1"';

function b64(o: object) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}
function jwt(sub: string | null, role: 'anon' | 'authenticated') {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function sql(text: string) {
  execSync(PSQL, { input: text, stdio: ['pipe', 'pipe', 'inherit'] });
}
function apiFor(sub: string) {
  const token = jwt(sub, 'authenticated');
  const sb = createClient(URL, jwt(null, 'anon'), {
    accessToken: async () => token,
    auth: { persistSession: false },
  });
  return createApi(sb);
}

let checks = 0;
function ok(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  checks++;
}
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  checks++;
}
async function rejects(fn: () => Promise<unknown>, like: RegExp, label: string) {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof ApiError)) throw new Error(`FAIL: ${label} (not an ApiError: ${String(e)})`);
    if (!like.test(e.message)) throw new Error(`FAIL: ${label} (message was: ${e.message})`);
    checks++;
    return e;
  }
  throw new Error(`FAIL: ${label} (expected an error)`);
}

async function main() {
  const A = randomUUID();
  const B = randomUUID();
  sql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'api-a@example.invalid', '{"full_name":"Asha Verma","phone":"9811111111"}'),
      ('${B}', 'api-b@example.invalid', '{}');
    update public.restaurant_settings set is_accepting_orders = true, opening_time = '00:00', closing_time = '00:00',
      delivery_fee = 30, min_order_amount = 100, serviceable_pincodes = '{}';
  `);

  try {
    const a = apiFor(A);
    const b = apiFor(B);

    // ---------- restaurant + menu ----------
    const r = await a.getRestaurant('krishna-dhaba');
    eq(r.name, 'Krishna Dhaba', 'restaurant name');
    await rejects(() => a.getRestaurant('nope'), /not found/i, 'unknown restaurant');

    const s = await a.getSettings(r.id);
    eq(typeof s.delivery_fee, 'number', 'delivery_fee is a number');
    eq(s.delivery_fee, 30, 'delivery fee');
    eq(s.min_order_amount, 100, 'min order');
    ok(Array.isArray(s.serviceable_pincodes), 'pincodes is array');
    eq(await a.isOpenNow(r.id), true, 'open now (24h test hours)');

    const cats = await a.getCategories(r.id);
    eq(cats.length, 4, 'four categories');
    eq(cats[0].name, 'Starters', 'categories sorted');
    const prods = await a.getAvailableProducts(r.id);
    eq(prods.length, 9, 'nine available products');
    ok(prods.every((p) => p.is_available), 'only available products returned');
    eq(typeof prods[0].price, 'number', 'price is a number');

    const dal = prods.find((p) => p.name === 'Dal Tadka')!;
    const naan = prods.find((p) => p.name === 'Butter Naan')!;
    eq((await a.getProduct(dal.id))?.name, 'Dal Tadka', 'getProduct');
    eq(await a.getProduct(randomUUID()), null, 'getProduct unknown = null');
    eq((await a.getProductsByIds([dal.id, naan.id])).length, 2, 'getProductsByIds');
    eq((await a.getProductsByIds([])).length, 0, 'getProductsByIds empty');

    // An unavailable item disappears from the menu, but is still findable by id (for cart warnings)
    sql(`update public.products set is_available = false where id = '${naan.id}'`);
    eq((await a.getAvailableProducts(r.id)).length, 8, 'unavailable item hidden from menu');
    eq((await a.getProductsByIds([naan.id]))[0].is_available, false, 'cart check sees unavailable flag');
    sql(`update public.products set is_available = true where id = '${naan.id}'`);

    // ---------- profile ----------
    const p0 = await a.getProfile(A);
    eq(p0?.full_name, 'Asha Verma', 'profile created from sign-up data');
    await a.updateProfile(A, { full_name: 'Asha V.', phone: '9822222222' });
    eq((await a.getProfile(A))?.phone, '9822222222', 'profile updated');

    // ---------- addresses ----------
    const addr = {
      recipient_name: 'Asha Verma', phone: '9811111111', house_no: '12B', street_locality: 'MG Road',
      landmark: null, city: 'New Delhi', state: 'Delhi', pincode: '110001',
    };
    await a.saveAddress(A, addr);
    await a.saveAddress(A, addr); // duplicate ignored
    const list = await a.getAddresses();
    eq(list.length, 1, 'address saved once');
    eq((await b.getAddresses()).length, 0, 'B cannot see A addresses');
    await a.deleteAddress(list[0].id);
    eq((await a.getAddresses()).length, 0, 'address deleted');

    // ---------- placing an order ----------
    const input = {
      restaurantId: r.id,
      items: [{ product_id: dal.id, quantity: 2 }, { product_id: naan.id, quantity: 1 }],
      customerName: 'Asha Verma', customerPhone: '9811111111', houseNo: '12B', streetLocality: 'MG Road',
      landmark: '', city: 'New Delhi', state: 'Delhi', pincode: '110001', instructions: '',
      idempotencyKey: 'test-key-1',
    };
    const placed = await a.placeOrder(input);
    eq(typeof placed.total, 'number', 'placeOrder returns numeric total');
    eq(placed.subtotal, 300, 'subtotal');
    eq(placed.total, 330, 'total includes delivery fee');
    eq(placed.status, 'pending', 'status pending');
    ok(/^KD-\d{6}-\d{4}$/.test(placed.order_number), 'order number format');

    const again = await a.placeOrder(input);
    eq(again.order_id, placed.order_id, 'retry with same key returns same order');

    const e1 = await rejects(
      () => a.placeOrder({ ...input, idempotencyKey: 'k2', items: [{ product_id: randomUUID(), quantity: 1 }] }),
      /no longer available/i, 'bad item rejected with friendly message');
    eq((e1 as ApiError).fromServer, true, 'server rejection flagged as fromServer');
    await rejects(() => a.placeOrder({ ...input, idempotencyKey: 'k3', pincode: '12' }), /PIN/i, 'bad PIN');
    await rejects(() => a.placeOrder({ ...input, idempotencyKey: 'k4', customerPhone: '123' }), /mobile/i, 'bad phone');
    await rejects(
      () => a.placeOrder({ ...input, idempotencyKey: 'k5', items: [{ product_id: naan.id, quantity: 1 }] }),
      /Minimum order/i, 'minimum order');

    // ---------- reading orders ----------
    const mine = await a.getMyOrders();
    eq(mine.length, 1, 'order list has one order');
    eq(mine[0].order_items.length, 2, 'order list embeds items');
    eq(mine[0].order_number, placed.order_number, 'order list number');

    const detail = (await a.getOrder(placed.order_id))!;
    eq(detail.order_items.length, 2, 'detail has items');
    eq(detail.order_status_history.length, 1, 'detail has history');
    eq(detail.delivery_pincode, '110001', 'address snapshot stored');
    eq(detail.payment_method, 'cod', 'cash on delivery');
    eq(typeof detail.order_items[0].unit_price, 'number', 'item price numeric');

    eq(await b.getOrder(placed.order_id), null, 'B cannot open A order');
    eq((await b.getMyOrders()).length, 0, 'B sees no orders');

    // ---------- cancelling ----------
    await rejects(() => b.cancelOrder(placed.order_id), /not found/i, 'B cannot cancel A order');
    await a.cancelOrder(placed.order_id);
    const cancelled = (await a.getOrder(placed.order_id))!;
    eq(cancelled.status, 'cancelled', 'order cancelled');
    eq(cancelled.cancel_reason, 'Cancelled by customer', 'cancel reason stored');
    eq(cancelled.cancelled_by, 'customer', 'cancelled_by customer');
    eq(cancelled.order_status_history.length, 2, 'history has two rows');
    eq(cancelled.order_status_history[1].to_status, 'cancelled', 'history sorted oldest-first');
    await rejects(() => a.cancelOrder(placed.order_id), /not allowed/i, 'cannot cancel twice');

    console.log(`ALL ${checks} API CHECKS PASSED`);
  } finally {
    sql(`
      delete from public.orders where customer_id in ('${A}','${B}');
      delete from auth.users where id in ('${A}','${B}');
      delete from public.order_counters;
    `);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
