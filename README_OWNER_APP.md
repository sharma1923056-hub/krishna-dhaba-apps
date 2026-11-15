# Krishna Dhaba Owner App

Separate Expo Router Android app for the existing Krishna Dhaba Supabase project.

## Included in this first version
- Email/password sign-in through Supabase Auth
- Membership gate using `restaurant_staff`
- Dashboard using `dashboard_stats(p_restaurant_id)`
- Order list and legal status transitions through `update_order_status`
- Menu availability and price editing
- Owner-only restaurant settings (RLS remains the authority)
- Customer summary via `customer_summary` RPC
- GitHub Actions Android APK workflow

## Before building
1. In Supabase SQL Editor, run `005_owner_app_functions.sql`.
2. Ensure the owner account exists in Authentication -> Users.
3. Assign the account using the repository's `006_make_owner_TEMPLATE.sql` after replacing `OWNER_EMAIL_HERE`.
4. Confirm the user's membership row has role `owner`.
5. Keep the existing GitHub repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Add to existing GitHub repository
Upload the entire `restaurant-owner-app` folder at the repository root and upload
`.github/workflows/build-owner-apk.yml` to the same path in the repository.

The `package-lock.json` is included and matches the dependency versions used by the working Customer App's Expo 54 setup.

## Security
- The app uses only the Supabase publishable/anon key. Never put service_role keys in an app.
- Database RLS and RPC checks remain authoritative. Hiding controls in the UI is not security.
- Owner settings updates are protected by existing `is_owner` RLS policies.
- Staff menu/order access is protected by existing `is_staff` policies and functions.
- Customer list is derived from order snapshots only, never `customer_addresses`.

## Known first-version limitations
- Product availability and price can be edited; adding products/categories, uploading photos, push notifications, and advanced reporting are follow-up features.
- This code is a generated starter implementation and must pass the GitHub type-check/build and real-device tests before operational use.
