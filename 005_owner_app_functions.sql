-- Krishna Dhaba | Migration 005: Owner App customer summary
-- One row per customer phone number, derived only from order snapshots.
-- Does NOT read customers' private saved address books.

create or replace function public.customer_summary(
  p_restaurant_id uuid,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  customer_phone text,
  customer_name text,
  total_orders bigint,
  delivered_orders bigint,
  total_spent numeric,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_staff(p_restaurant_id) then
    raise exception 'Not allowed.';
  end if;

  return query
  select
    o.customer_phone,
    (array_agg(o.customer_name order by o.placed_at desc))[1],
    count(*),
    count(*) filter (where o.status = 'delivered'),
    coalesce(sum(o.total) filter (where o.status = 'delivered'), 0),
    max(o.placed_at)
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and (v_term is null
      or o.customer_phone ilike '%' || v_term || '%'
      or o.customer_name ilike '%' || v_term || '%')
  group by o.customer_phone
  order by max(o.placed_at) desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.customer_summary(uuid, text, integer, integer) from public, anon;
grant execute on function public.customer_summary(uuid, text, integer, integer) to authenticated;
