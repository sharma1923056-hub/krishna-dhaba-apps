# Krishna Dhaba: Customer App (React Native + Expo)

Customer-facing mobile app. Talks only to Supabase (see `../supabase`).

- `app/`    screens (Expo Router): sign-in, home, menu, item details, cart, checkout, orders, account
- `src/api` all database calls (`createApi`), tested against a real database in `tests/api.test.ts`
- `src/hooks` data hooks + Realtime sync (menu, settings, the customer's orders)
- `src/store` login state and the persistent cart

Settings come from environment variables at build time (see `.env.example`):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key only), `EXPO_PUBLIC_RESTAURANT_SLUG`.

Checks: `npm run typecheck`. The APK is built in the cloud by `.github/workflows/build-customer-apk.yml`.
