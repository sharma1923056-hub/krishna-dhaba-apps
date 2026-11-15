# Krishna Dhaba: Restaurant Ordering System

Two Android apps sharing one Supabase backend.

- `restaurant-customer-app/`  customers order food (Phase 3, done)
- `restaurant-owner-app/`     owner manages orders and menu (Phase 4, next)
- `supabase/`                 database, security rules, functions, tests (Phase 2, done)
- `documentation/`            setup guides
- `.github/workflows/`        cloud APK builds + Supabase keep-alive

Never commit the Supabase **secret / service_role** key. The apps only use the public (publishable) key.
