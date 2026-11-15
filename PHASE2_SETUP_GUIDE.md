# Phase 2: Supabase Setup Guide (Krishna Dhaba)

Do these steps on your laptop browser, in your **krishna-dhaba-dev** Supabase project.
**Never paste or share your secret / service_role key anywhere.**

## Step 1: Create the database (one paste)

1. Open the file **`run_all_in_one.sql`** and copy ALL of its contents.
2. In Supabase: left menu **SQL Editor** → **New query** → paste → click **Run**.
3. Expected result: **"Success. No rows returned"**.
   If you see a red error, copy the full message and send it to me. Do not try to fix it by hand.

## Step 2: Check it worked

- **Table Editor**: you should see 12 tables (profiles, restaurants, restaurant_staff, restaurant_settings, categories, products, customer_addresses, order_counters, orders, order_items, order_status_history, push_tokens).
- Open **products**: 9 sample items. **restaurants**: one row, Krishna Dhaba.
- **Storage**: a bucket named **menu-images** (marked Public).
- **Database → Publications → supabase_realtime**: orders, products, categories and restaurant_settings are listed.

## Step 3: Create the owner login

1. **Authentication → Users → Add user → Create new user**.
2. Enter the owner's email and a strong password. Tick **Auto Confirm User**.
3. Open **`006_make_owner_TEMPLATE.sql`**, replace `OWNER_EMAIL_HERE` with that exact email, paste into a new SQL query and **Run**.
4. The last query shows one row with role `owner`.

(Use a different email and change `'owner'` to `'staff'` to add a staff member the same way.)

## Step 4: Run the security test (optional but recommended)

1. Open **`tests/security_workflow_test.sql`**, copy everything, paste into a new SQL query and **Run**.
2. A **red error is the expected result**. The message must read:
   **`ALL 67 CHECKS PASSED (everything rolled back)`**
   It rolls back on purpose, so it leaves no test data behind.
3. Any message starting with **FAIL** means something is wrong. Send it to me.

## Step 5: Security Advisor

**Advisors → Security Advisor** (in the dashboard). Run it and send me any warnings it shows (a screenshot is fine).

## What to send me

1. The result of Step 1 (success, or the exact error).
2. The result message from Step 4.
3. Any Security Advisor warnings.

---

# Design notes (decisions made in Phase 2)

| Topic | Decision |
|---|---|
| Who can write orders | Nobody directly. Only `place_order` and `update_order_status` functions can, so prices and status rules can't be bypassed. |
| Prices | Always calculated on the server from the products table; the app's prices are ignored. |
| Order numbers | `KD-YYMMDD-0001`, restarting each day in the restaurant's timezone. |
| Order status rules | Staff: pending → confirmed → preparing → ready_for_dispatch → out_for_delivery → delivered, or cancel (reason required) before delivered. Customer: may cancel only while pending. |
| Reject = cancel | There's no separate "rejected" status; a staff cancel from pending with a reason is a rejection. |
| Spam limit | Max 3 orders waiting in "pending" per customer. |
| Opening hours | Server-checked in the restaurant's timezone; same opening and closing time means open 24 hours. |
| Delete | Menu items and categories are soft-deleted (old orders stay intact). A category with live items can't be deleted. |
| Settings access | Menu and orders: owner + staff. Restaurant info and settings (fee, hours, ordering on/off): owner only. |
| Reports | "Sales" = total of delivered orders. Days/weeks/months use the restaurant's timezone. |
| Customer privacy | Orders carry their own address snapshot. The owner can't read customers' saved address books. |
| Menu visibility | The database lets customers read non-deleted items (including unavailable ones) so availability changes arrive live. The customer app only shows available items, and the server re-checks at checkout. |
| Realtime limit | When an item is deleted (not just made unavailable), customers' phones learn about it on their next refresh. The server still rejects it at checkout with a clear message. |
| Phone numbers | 10 digits (India). Tell me if you need international numbers. |

## Files

```
supabase/
  run_all_in_one.sql          <- paste this (Step 1)
  006_make_owner_TEMPLATE.sql <- Step 3
  seed.sql                    <- sample data (also included in run_all_in_one.sql)
  migrations/001..004         <- the same SQL split into parts (for GitHub / future CLI use)
  tests/security_workflow_test.sql
```

## Change log

- **2026-11-14**: Phase 2 created: schema, functions, RLS, storage, realtime, seed, tests.
