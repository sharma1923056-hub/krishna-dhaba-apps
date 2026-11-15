-- =====================================================================
-- Krishna Dhaba  |  Make a user the restaurant OWNER (or STAFF)
--
-- STEP 1 (dashboard): Authentication -> Users -> "Add user" -> "Create new user"
--          Enter the owner's email + a strong password, tick "Auto Confirm User".
-- STEP 2: Replace OWNER_EMAIL_HERE below with that exact email, then run.
--          (Use role 'staff' instead of 'owner' for a staff member.)
-- =====================================================================

insert into public.restaurant_staff (restaurant_id, user_id, role)
select r.id, u.id, 'owner'
from public.restaurants r
join auth.users u on lower(u.email) = lower('OWNER_EMAIL_HERE')
where r.slug = 'krishna-dhaba'
on conflict (restaurant_id, user_id) do update set role = excluded.role;

-- Check it worked: this should return one row.
select s.role, u.email
from public.restaurant_staff s
join auth.users u on u.id = s.user_id;
