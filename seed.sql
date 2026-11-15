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
