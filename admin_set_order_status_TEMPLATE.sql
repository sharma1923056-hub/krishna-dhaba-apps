-- =====================================================================
-- TEST ONLY: pretend to be the restaurant before the Owner app exists.
-- Changes an order's status from the Supabase SQL Editor so you can watch
-- the Customer app update live on your phone.
--
-- 1. Place an order in the Customer app and note its number (e.g. KD-261115-0001).
-- 2. Put that number and the new status below, then Run.
-- Statuses: confirmed, preparing, ready_for_dispatch, out_for_delivery, delivered, cancelled
-- (For 'cancelled' also fill in a reason.)
-- =====================================================================
with target as (
  select id, status from public.orders where order_number = 'KD-261115-0001'   -- <-- change
),
upd as (
  update public.orders o
     set status         = 'confirmed',                                          -- <-- change
         cancel_reason  = case when 'confirmed' = 'cancelled' then 'Test cancellation' else o.cancel_reason end,
         cancelled_by   = case when 'confirmed' = 'cancelled' then 'staff' else o.cancelled_by end,
         delivered_at   = case when 'confirmed' = 'delivered' then now() else o.delivered_at end,
         payment_status = case when 'confirmed' = 'delivered' then 'paid' else o.payment_status end
    from target t
   where o.id = t.id
  returning o.id
)
insert into public.order_status_history (order_id, from_status, to_status, reason)
select t.id, t.status, 'confirmed', null                                        -- <-- change (same status as above)
from target t;

select order_number, status from public.orders order by placed_at desc limit 5;
