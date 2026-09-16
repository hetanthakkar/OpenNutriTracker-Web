# MyFitnessTracker web prototype

A Next.js PWA backed by CockroachDB for food search, diary, tracking, profiles, goals, preferences, recipes and health ingestion.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database setup

After the original schema scripts have been run, apply the non-destructive profile-aware upgrade once:

```bash
npm run db:create-core-schema-v2
```

This preserves existing records, creates a default profile for each existing user, backfills `profile_id` and `diary_date`, enables Snack entries, and creates normalized nutrient-target and daily-plan tables. Run it before starting the updated API because the routes now expect the v2 columns.

For multi-word, brand-aware, typo-tolerant catalog search, create the normalized trigram index once:

```bash
npm run db:add-smart-food-search-index
```

Enable adjustable portions, nullable weights for foods whose source has no gram conversion, and indexed MFP search once:

```bash
npm run db:enable-flexible-portions
```

This command temporarily unlocks `mfp_foods`, builds its normalized search column and trigram index, and restores the schema lock when finished.

Enable private label-scanned foods and Open Food Facts-derived custom foods once:

```bash
npm run db:enable-nutrition-label-scanner
```

Nutrition-label photos are processed in the browser and are never sent to the API. The pinned PP-OCRv6 small detection/recognition models and ONNX Runtime WASM runtime are served from this deployment under `public/ocr-assets/v1/`; the app warms them during idle time on normal visits and reuses the browser cache for later scans. A first visit may still take longer while the local static assets download.

Enable private partner invitation links, granular sharing permissions, and shared dashboards once:

```bash
npm run db:create-sharing-schema
```

Enable Apple Health imports before generating a Conduit webhook token:

```bash
npm run db:create-health-schema
```

The webhook retains every delivery and maps common `samples`, `records`, `data`,
or daily-summary payloads into weight, workout, steps, sleep, and heart-rate
records. Repeated deliveries and readings are deduplicated.

## Firebase Authentication

Firebase Authentication supplies Google sign-in and the app exchanges Firebase ID tokens for HTTP-only session cookies. Run the user-schema migration once:

```bash
npm run db:create-auth-schema
```

Configure a Firebase Web App plus a Firebase service-account credential:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Enable Google as a Firebase sign-in provider and add each deployment URL to its authorized domains. On first sign-in, the current browser profile is linked to the Firebase account so existing diary data stays available.

The food API ranks exact names, brands, all query tokens, catalog popularity, and the current profile's recent/frequent diary history. Search responses are private and are not shared-cacheable.

## PWA behavior

The PWA runtime is adapted from the `paired/` app rather than copying its Vite UI/config directly:

- standalone manifest and iOS Home Screen metadata
- mobile bottom navigation becomes a non-scrolling shell row when installed, with safe-area padding and the iOS cold-launch viewport-height correction
- service-worker update checks on launch, focus, `pageshow`, visibility changes, and once per minute while visible
- `/version.json` is always network-fetched and compared with the running build; if a worker is stuck on an older deploy, its registrations/caches are removed and the app reloads once
- Web Push subscriptions are refreshed on launch when permission is already granted
- notification taps focus an existing app window when possible and route with `?page=home|diary|trends|profile|settings`

The service worker intentionally does not cache the Next.js application shell. Navigation is network-first so deployments do not get pinned behind stale HTML.

## Push configuration

Copy `.env.example` and set:

```bash
NEXT_PUBLIC_WEB_PUSH_VAPID_KEY=...
NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT=...
```

`NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT` is optional. Without it, subscriptions are stored by the built-in `/api/push/subscriptions` endpoint; set it only to delegate subscription storage to another service.

For built-in notification delivery, set the VAPID values used to create browser subscriptions and the secret for your scheduler:

```bash
NEXT_PUBLIC_WEB_PUSH_VAPID_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=...
```

Then run `npm run db:create-notification-schema` once. Schedule an authenticated `GET /api/notifications/dispatch` every five minutes with `Authorization: Bearer $CRON_SECRET`. The route sends at most one daily diary reminder per user and local day, retries transient failures up to twice, and revokes expired browser subscriptions.

On Vercel, the update build ID uses the unique `VERCEL_DEPLOYMENT_ID` when available, then falls back to the commit SHA or a build timestamp. On other hosts, set `NEXT_PUBLIC_BUILD_ID` (or provide `COMMIT_SHA`) so every deploy has a distinct ID. Vercel headers keep `/`, `/sw.js`, `/version.json`, and the manifest revalidated so an installed PWA can see a production deploy immediately.

Nutrition scores, adaptive-expenditure history, and partner sharing now use saved profile and diary data. Partner invitations are secure 14-day links that can be copied or opened in the owner's email app—no paid email provider is required. When an owner enables dashboard-view notifications, active browser push subscriptions receive a best-effort alert at most once per viewer every six hours.

| UI area | Required APIs |
|---|---|
| Food search / barcode | `GET /api/foods?query=`, `GET /api/foods/:id`, `GET /api/mfp-foods?query=`, `GET /api/mfp-foods/:id`, `GET /api/foods/barcode/:barcode` |
| Diary | `GET /api/diary?date=`, `POST /api/diary/entries`, `PATCH/DELETE /api/diary/entries/:id` |
| Home dashboard | `GET /api/dashboard?date=` — calories, macros, nutrients, nutrition scores, personal plan, water, activity, weight, streak |
| Water, activity, weight | CRUD endpoints for each log type |
| Trends | `GET /api/trends?range=7d|30d|90d|all` |
| Profile, goals, settings | `GET/PUT /api/me`, `/api/me/preferences`, `/api/me/goals`, `/api/me/nutrient-goals` |
| Custom foods and recipes | CRUD `/api/custom-foods`, `/api/recipes` |
| Apple Health | `POST /api/health/conduit` webhook, plus health status and trend endpoints |
| Profiles | `GET/POST /api/profiles`, `POST /api/profiles/:id/select` |
| Visible nutrients | `GET/PUT /api/me/visible-nutrients` |
| Partner sharing | `GET /api/sharing`, invitation create/preview/accept/renew/revoke, share permission/revoke, and permission-filtered shared dashboard endpoints |
| Push notifications | internal subscription CRUD and protected daily-reminder dispatch endpoint |
