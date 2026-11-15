# Phase 3: Customer App. Build and install guide

You need: your laptop browser, your GitHub account, your Supabase project, and your Android phone.
No software to install on the laptop.

## A. Put the code on GitHub (about 10 minutes)

1. Download and unzip **`restaurant-management-system.zip`** on your laptop.
2. Open github.com → **+ → New repository**. Name: **krishna-dhaba-apps**, **Private**. Create it.
3. On the empty repository page click **uploading an existing file**.
4. Open the unzipped folder `restaurant-management-system`. Select **everything inside it except the `.github` folder**:
   `restaurant-customer-app`, `supabase`, `documentation`, `README.md`.
   Drag them into the GitHub page. Wait until all files finish uploading (about 60 files).
5. Click **Commit changes**.

### Add the two workflow files (they live in a hidden folder, so create them by hand)

1. In the repository click **Add file → Create new file**.
2. In the name box type exactly: `.github/workflows/build-customer-apk.yml`
   (typing the `/` creates the folders).
3. Open `.github/workflows/build-customer-apk.yml` from the unzipped folder in Notepad, copy everything, paste it into GitHub, and click **Commit changes**.
4. Repeat for `.github/workflows/supabase-keepalive.yml`.

## B. Give the build its connection settings (2 minutes)

1. In Supabase: click **Connect** (top bar) or **Project Settings → API Keys**. Copy the **Project URL** and the **publishable** key (older name: *anon*).
   **Do not use the secret / service_role key.**
2. In GitHub: repository → **Settings → Secrets and variables → Actions → New repository secret**. Add two secrets:
   - Name `SUPABASE_URL`, value: the Project URL
   - Name `SUPABASE_ANON_KEY`, value: the publishable key

## C. Build the APK (15-30 minutes, mostly waiting)

1. Repository → **Actions** tab. If asked, click **I understand my workflows, enable them**.
2. Click **Build Customer APK** (left) → **Run workflow** → **Run workflow**.
3. Wait for the green tick. The first build is slow (it downloads a lot); later ones are faster.
4. Open the finished run → scroll to **Artifacts** → click **krishna-dhaba-customer-apk**. A zip downloads.
5. Unzip it: inside is **krishna-dhaba-customer.apk**.

**If the run turns red:** open it, click the failed step, copy the last 30 lines of the log, and send them to me.

## D. Install on your Android phone

1. Send the APK to your phone (WhatsApp to yourself, Google Drive, or USB).
2. Tap the file. If Android asks, allow **Install unknown apps** for that app (Chrome, Files, WhatsApp…).
3. If Play Protect warns about an unrecognised app, tap **Install anyway** (normal for apps outside the Play Store).
4. Open **Krishna Dhaba**.

This APK works on 64-bit Android phones (almost all phones from the last 8 years).

## E. Test it yourself, in this order

1. **Create an account** (name, mobile, email, password) → you land on Home.
2. Home should show **Krishna Dhaba**, open/closed status, categories and Popular items.
3. **Menu**: search, filter by category, tap **Add**, open an item.
4. **Cart**: change quantities, see subtotal, delivery ₹30, total. Minimum order is ₹100.
5. **Checkout**: fill the address → **Place order** → confirm. You should see "Order placed!"
6. In Supabase **Table Editor → orders**: your order is there, with its items in **order_items**.
7. **Watch live updates**: open `supabase/tests/admin_set_order_status_TEMPLATE.sql`, put your order number in, run it with `confirmed`, then `preparing`, and so on. **The status on your phone should change by itself**, with no refresh.
8. Place another order and **Cancel** it while it is Pending.
9. Turn Wi-Fi/data off while on the order screen, change the status in Supabase, then turn it back on. The app should catch up within a few seconds.
10. **Account**: edit your details, see saved addresses, sign out and in again.

## What to tell me

- Whether the build went green (or the error log).
- Anything that looked wrong, crashed or felt confusing (a screenshot helps).
- What you think of the look and feel (colours, wording, layout).

## Known limits of this phase

- **No push notifications yet** (Phase 5). Live updates work while the app is open; closed-app alerts come later.
- **No food photos yet**: the Owner app (Phase 4) will upload them. Placeholders show until then.
- **Forgot password** isn't in the app yet. If someone is locked out, reset their password in Supabase (Authentication → Users).
- **Not yet run on a real phone by me.** I tested the data layer against a real database (51 checks), type-checked the code, and bundled it with the real Expo bundler, but I can't run Android here. Your first install is the real test, so please report anything odd.
- The first cloud build is the first time the Android build runs. If it fails on a setup detail, send me the log and I'll fix it.

## Change log
- Phase 3: Customer app created (auth, menu, cart, checkout, order tracking with Realtime, history, account), GitHub APK workflow, Supabase keep-alive workflow.
