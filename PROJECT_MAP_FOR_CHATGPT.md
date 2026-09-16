# OpenNutriTracker project map for ChatGPT

Last inspected: 2026-09-14 in the local working tree

Repository: OpenNutriTracker-Web

Local path: /Users/hetanthakkar/OpenNutriTracker/web-prototype

Branch and base commit: main at 065d352, matching origin/main when this map was written

## Read this first

This document is an orientation map, not a replacement for reading the current source. The local working tree contains a large amount of uncommitted work beyond commit 065d352. A ChatGPT session that only connects to the GitHub main branch will see the older committed version, not the application described here.

Before asking ChatGPT Web to edit the project:

1. Give it this file first.
2. Give it repository access to the branch containing the latest work, or upload the current source files involved in the change.
3. Never upload .env.local. It contains secrets.
4. Do not upload .next, node_modules, paired/node_modules, generated dist files, or the large OCR binaries unless the task specifically concerns those binaries.
5. Ask it to inspect the current files before changing them. This map explains relationships and intent, but the source remains authoritative.
6. If the work is still uncommitted locally, either commit and push it to a safe branch or upload a source-only archive. GitHub access to main alone is not enough.

Suggested first message for a new ChatGPT conversation:

> This is the project map for my OpenNutriTracker repository. Treat it as orientation, then inspect the current source files before making changes because the working code may be newer than this snapshot. The primary product is the root Next.js nutrition PWA. The paired directory is a separate couples PWA and must not be changed unless I explicitly ask. Preserve existing behavior, database compatibility, profile scoping, immutable diary snapshots, unit conversions, PWA update behavior, and privacy boundaries. Before editing, tell me which files and data flows the requested change affects. After editing, run the relevant tests, lint, and production build.

## Executive summary

The repository contains two applications:

1. The primary root application is a full-stack Next.js 16 nutrition-tracking PWA. It owns food search, barcode scanning, on-device nutrition-label OCR, diary logging, adaptive calorie planning, nutrition scoring, weight/activity tracking, optional Apple Health ingestion, Web Push reminders, Firebase sign-in, and permission-based partner sharing.
2. paired/ is a separate React 19 and Vite 7 couples PWA named Together. It expects a Django API that is not present in this repository. It is excluded from the root TypeScript and ESLint configuration. The root PWA borrowed some update and install ideas from it, but the products do not share runtime state or APIs.

The primary app is not organized as multiple page routes. app/page.tsx mounts one client-side AppShell, which switches among Today, Diary, Trends, and Account views. The server surface is a set of 44 Next.js route-handler files backed primarily by CockroachDB.

The local source snapshot contains about 26,000 lines across app, components, lib, scripts, tests, docs, and paired/src. Generated directories account for most of the repository's disk size and should not be treated as source.

## Current working-tree warning

The project is currently very dirty. At inspection time:

- many tracked root files were modified;
- .env.example and public/logo.svg were deleted;
- the complete app/api tree, many feature components, most server libraries, migration scripts, OCR assets, and tests were untracked;
- large untracked media files existed at the repository root;
- the map describes the latest working tree, not only the last commit.

Do not use a destructive Git reset or checkout to “clean up” this tree. Preserve the user's work. Re-check git status before every substantial change because the tree may be edited concurrently.

## System architecture

~~~mermaid
flowchart LR
    Browser[Next.js client PWA] --> Routes[Next.js route handlers]
    Routes --> User[Anonymous or Firebase session resolver]
    User --> AppDB[(CockroachDB food_catalog.app)]
    Routes --> Catalog[(food_catalog.public catalogs)]
    Browser --> OCR[On-device PaddleOCR worker]
    OCR --> Assets[Same-origin OCR models and ONNX WASM]
    Routes --> OFF[Open Food Facts fallback]
    Firebase[Firebase Auth] --> Browser
    Browser --> Routes
    Conduit[Conduit Health Sync iOS app] --> Health[Health webhook]
    Health --> AppDB
    Scheduler[External five-minute scheduler] --> Reminder[Reminder dispatch]
    Reminder --> Push[Web Push endpoints]
    Viewer[Invited viewer] --> Share[Permission-filtered shared dashboard]
    Share --> AppDB
~~~

The main trust boundaries are:

- nutrition-label images remain in the browser and are not uploaded;
- Firebase ID tokens are exchanged for HTTP-only application session cookies;
- anonymous use is associated with an HTTP-only UUID cookie and still persists data in the server database;
- Health ingestion uses a one-time generated bearer token stored only as a SHA-256 hash;
- sharing invitation secrets are stored as hashes and become scoped profile-share records after acceptance;
- shared dashboards query and return only permission-granted categories;
- push delivery is best effort and must never block diary or sharing access.

## Runtime stack

### Primary app

- Next.js 16.3.4 App Router, React, TypeScript strict mode.
- Custom CSS, not Tailwind. Nunito is served locally from public/fonts/Nunito.ttf.
- lucide-react supplies icons.
- pg connects directly to CockroachDB.
- Firebase client and firebase-admin provide optional Google authentication.
- web-push provides standards-based push delivery.
- @zxing/browser handles barcode camera scanning.
- PaddleOCR.js 0.4.2, ONNX Runtime WASM, and local model archives handle label OCR.
- Node 22 is used in GitHub Actions. The latest local build was also successful.

### paired app

- React 19.2, Vite 7.3, TypeScript 5.9, Tailwind 4.
- Firebase Cloud Messaging is optional.
- vite-plugin-pwa generates the shell precache and service worker.
- All business data is expected from VITE_API_URL, defaulting to http://localhost:8000.
- Its documented Django backend is absent from this repository.

## Primary product navigation and state

AppShell owns the application-wide state and overlays:

- page: home, diary, trends, or menu;
- appearance: light/dark and accent;
- settings panel;
- display and unit preferences;
- Home section visibility;
- current water/weight/activity summary;
- food-picker mode and destination meal/date;
- diary and tracking refresh counters;
- onboarding visibility;
- invitation token;
- Firebase session status.

Desktop uses a fixed sidebar and top bar. Mobile uses bottom navigation with a central add button. Add actions are:

- meal search;
- barcode scan;
- vegan barcode lookup;
- activity;
- water;
- weight.

Water is intentionally hidden throughout the visible product because lib/ui-features.ts exports showWaterTracking = false. The water state, APIs, database tables, preference fields, tracking manager, and some copy remain in the code.

Profile switching is also intentionally absent from the visible shell even though profiles APIs and the current_profile_id model remain. Treat this as reserved household-mode infrastructure.

Deep links and notification navigation use query parameters such as page or screen. AppShell normalizes home/today/main, diary, trends, and profile/settings/menu variants. The service worker sends an ont-navigate message, which the client turns into the ont:navigate custom event.

## Screen map

### Today

Main file: components/home-view.tsx

Today fetches GET /api/dashboard?date=YYYY-MM-DD. A module-level cache is keyed by authentication/profile scope, date, and refresh version with a two-minute TTL.

Visible modules are controlled by stored Home preferences:

- quick statistics: weight and, when enabled, water;
- adaptive energy budget: supplied calories, expenditure, target, and remaining;
- optional macro progress;
- macro, micronutrient, and food-quality scores;
- meals logged today;
- food-logging streak;
- activity;
- habits, currently mainly water and therefore hidden with the feature flag;
- detailed nutrient targets.

GET /api/dashboard can persist a daily plan snapshot as part of resolving the current plan. It is therefore a read endpoint with an intentional database side effect.

### Diary

Main file: components/diary-view.tsx

The diary contains:

- a month calendar;
- selected-day totals;
- Breakfast, Lunch, Dinner, and Snack sections;
- add, edit, and delete actions;
- calorie and optional macro summaries;
- day-completion state.

Calendar statuses:

- met: intake is roughly 90–110 percent of the goal;
- missed: a completed day outside the target band;
- logged: has food but is not completed or has no goal.

A future day cannot be marked complete. A day needs at least one food entry before completion. Adding, editing, or deleting food clears that day's completion because the evidence changed.

Diary entries store nutrition and portion snapshots. Historical totals do not change when the source catalog, custom food, scanned food, or recipe changes later.

### Trends

Main files: components/trends-view.tsx, components/expenditure-card.tsx, components/charts.tsx, components/tracking-manager.tsx

Ranges are 7 days, 30 days, 90 days, and all. A module cache is keyed by user/profile scope, period, and refresh version.

It shows:

- adaptive expenditure readiness/history;
- logging streak;
- weight change and weight chart;
- energy chart;
- macro chart;
- activity totals;
- optional water chart;
- Apple Health steps, sleep, resting heart rate, and other imported signals.

TrackingManager loads and edits water, activity, and weight logs in place. Successful mutations dispatch ont-tracking-updated, causing AppShell to refresh the relevant screen data.

Trends fills each calendar day in the requested range, using zero for missing visible totals. Its averages divide by calendar-day count, not only logged-day count. Adaptive expenditure still uses only completed intake days.

### Account and profile

Main file: components/profile-view.tsx

The profile view aggregates /api/me, /api/me/preferences, /api/sharing, and /api/health/conduit and presents:

- identity and current goal;
- height, birth date, equation sex, activity level, target weight, weekly rate, and BMI;
- weight logging;
- reminder settings;
- Apple Health connection state;
- partner sharing;
- settings.

The server model supports multiple profiles, but the current UI acts as a single-profile experience.

### Settings

Main file: components/settings-view.tsx

Settings panels include:

- units and energy display;
- calorie calculation explanation;
- manual calorie adjustment;
- macro split;
- meal split;
- nutrient goals;
- diary day-start time;
- display density and which nutrition details are shown;
- appearance and accent;
- notifications;
- partner sharing;
- custom foods;
- recipes;
- Home section visibility;
- Firebase account.

Preferences are generally auto-saved with a 500 ms debounce through PUT /api/me/preferences. Some panel buttons mainly close the panel and show prototype confirmation copy because the data already auto-saved. Changing calculation/display preferences can force a Today refresh.

The language setting controls locale-sensitive formatting but does not translate the interface text.

Appearance is cached before the server preferences arrive using ont:appearance-preferences:v1, reducing theme flash.

### Visual design and responsive layout

The root app uses a warm, rounded health-dashboard style:

- Nunito throughout;
- a warm cream canvas and light surface cards;
- leaf green as the default accent, with user-selectable accent color;
- semantic blue, coral, amber, teal, and green tones;
- large cards commonly use about 26 px corner radii;
- light and dark values come from CSS variables on the document root;
- desktop sidebar/dashboard layouts collapse through breakpoints around 1280, 1100, 760, and 400 px;
- mobile dialogs become bottom sheets and account for safe areas and the visual keyboard.

Most reusable visual rules live in app/globals.css. Later CSS files are intentional overrides for settings, interaction behavior, installed-PWA layout, Apple Health, expenditure, and the adaptive budget. When a style appears ineffective, inspect import order in app/layout.tsx before adding specificity.

### Onboarding

Main file: components/onboarding-flow.tsx

Six steps:

1. Name, date of birth, and sex used only for the Mifflin–St Jeor energy equation.
2. Height, current weight, optional target weight, and activity level.
3. Lose, maintain, or gain goal plus weekly pace.
4. Starting calorie and macro plan preview.
5. units, day start, theme, locale, and nutrition-detail toggles.
6. reminder and Home layout choices.

Save writes profile data, optional current weight, and preferences, then sets onboardingComplete. The plan preview is a starting estimate and uses a 1,200 kcal floor and 5,000 kcal ceiling.

### Add-food flow

Main file: components/food-picker.tsx

Search runs across four direct search sources:

- primary Typesense-derived catalog in public.typesense_foods;
- imported MFP catalog in public.mfp_foods;
- the profile's custom foods;
- the profile's previously scanned catalog foods;
- recipes are also available in the saved-food interface.

The main picker debounces search, aborts stale/slow requests, publishes sources as they return, deduplicates normalized name/brand matches, and prefers the primary catalog over MFP duplicates. Empty catalog search can show recent items.

After selection:

- source-specific detail endpoints return normalized portions;
- the picker remembers the last used portion for primary foods from diary history;
- the user chooses an amount and portion;
- nutrition is scaled client-side;
- POST /api/diary/entries stores immutable snapshots.

Meal defaults from the current clock: Breakfast, Lunch, Dinner, or Snack.

### Portion engine

Main file: lib/food-portions.ts

Canonical behavior:

- Typesense foods are generally stored per 100 g and expose source servings plus gram and ounce options when a reliable weight exists.
- MFP nutrients use source-native serving multipliers. Gram conversion is only derived when an explicit gram serving exists.
- Custom foods support per serving, per 100 g, per 100 ml, and per package bases.
- An unknown gram weight stays null. Do not invent a mass conversion.
- selectedPortionMultiplier scales nutrients; selectedPortionGrams separately reports physical mass when known.
- internal nutrient keys remain canonical regardless of display units.

### Barcode flow

Main files: components/barcode-camera-scanner.tsx, app/api/foods/barcode/[barcode]/route.ts

ZXing reads live camera frames. The API:

1. normalizes numeric barcodes and checks the primary local catalog;
2. tries canonical leading-zero matching;
3. falls back to Open Food Facts API v3 with a short timeout and server revalidation;
4. returns a normalized result.

An Open Food Facts result is saved as a private custom food before being added to the diary, protecting the historical snapshot and making it available later. If no product is found, the UI can open the nutrition-label scanner.

### Nutrition-label OCR

Main files:

- components/nutrition-label-scanner.tsx
- lib/nutrition-label.ts
- lib/nutrition-ocr-assets.ts
- public/ocr-assets/v1/*
- tests/nutrition-label.test.ts

The scanner supports live camera recognition, still capture, image upload, rotation, and manual entry.

The image remains in the browser. PaddleOCR runs in a dedicated worker with PP-OCRv6 small detection and recognition models. Model archives, worker files, and ONNX WASM are served from the same deployment. Small helper modules are loaded from pinned jsDelivr package URLs only when the scanner opens.

The background runtime waits about five seconds and an idle slot, respects offline, save-data, and slow connections, and warms local assets. Models are stored in Cache Storage bucket nutritracker-ocr-models-v1. The scanner can request foreground-priority download immediately.

The parser:

- reconstructs visual rows from OCR polygons;
- detects per-serving, per-100 g, per-100 ml, and per-package bases;
- recognizes multilingual aliases for energy, macros, sugar/fiber, sodium, cholesterol, vitamin D, calcium, iron, and potassium;
- distinguishes nutrition columns from percentage daily-value columns;
- converts kJ to kcal and compatible g/mg units;
- derives sodium from salt when sodium is absent;
- marks inferred, low-confidence, or less-than values for review;
- warns about obviously inconsistent relationships;
- reconciles repeated live frames by clustering near-equal values and excluding one-frame outliers by default.

Saving always goes through a human-editable review screen and creates a profile-private custom food with source label_scan.

### Vegan scanner

Main files: components/vegan-scanner.tsx, app/api/vegan/barcode/[barcode]/route.ts, scripts/import-vegan-products.mjs

The imported app.vegan_products dataset is searched by canonical numeric barcode. A match confirms presence in that specific vegan dataset. Absence is explicitly not proof that a product is non-vegan. Primary food search can show a vegan badge when its barcode matches the imported dataset.

The importer streams an RFC 4180 CSV in 1,000-row batches, handles quoted newlines, can dry-run, resume/skip existing rows, and optionally retains the large source JSON payload. Raw payload retention is off by default.

### Custom foods

Main files: lib/custom-food.ts and custom-food route handlers

Custom foods are profile-scoped and support manual, label_scan, and open_food_facts sources. They store serving geometry, nutrition basis, barcode/source URL metadata, the full nutrient JSON, and denormalized macro columns for search/list display.

### Recipes

Main files: components/recipe-builder.tsx and recipe route handlers

The builder searches custom, scanned, primary, and MFP foods. Each ingredient stores its source item, portion choice, amount, optional grams, and a nutrient snapshot. The client sums nutrients, divides by servings, and saves per-serving nutrition. Limits include at least one ingredient, no more than 100 ingredients server-side, and 1–1,000 servings.

Editing a source food later does not automatically recalculate existing recipe ingredient snapshots.

## Daily energy plan and adaptive expenditure

Main files:

- lib/onboarding-plan.ts for the cold-start preview;
- lib/expenditure.ts for the estimator;
- lib/calorie-plan.ts for turning expenditure into a target;
- lib/daily-plan.ts for database evidence and daily snapshots;
- docs/expenditure-algorithm.md for the research narrative;
- components/expenditure-card.tsx for presentation.

Cold start:

- Mifflin–St Jeor resting energy;
- activity multipliers: sedentary 1.2, light 1.375, active 1.55, very active 1.725;
- current weight, height, age, and equation sex are required;
- target is clamped to 1,200–5,000 kcal.

Adaptive evidence:

- daily-plan resolution looks back 119 days;
- only diary days explicitly marked complete contribute intake evidence;
- morning weight is paired causally with intake through the previous day;
- a robust constant-velocity Kalman smoother creates a weight trend;
- weight innovations are capped around 1.5 kg to reduce outlier impact;
- missing intake inside an evidence window is median-imputed;
- a 14-day evidence window is used;
- the code currently requires 10 logged intake days and 6 weighed days before an adaptive estimate is ready;
- body-fat percentage can tune Hall/Forbes energy density, but the current profile UI/data path does not collect it, so the usual fallback is 7,000 kcal/kg;
- step changes can accelerate estimator response by at most 35 percent, but steps are not directly added as “calories burned”;
- confidence is capped below 1.0;
- target changes are rate-limited, with the base cap around 120 kcal per day before the activity-response multiplier.

Daily target:

- adaptive or cold-start expenditure;
- plus weekly weight-goal energy adjustment divided across seven days;
- plus manual adjustment;
- clamped to 1,200–5,000 kcal;
- macro grams derive from percentages using 4 kcal/g for carbohydrate and protein and 9 kcal/g for fat;
- persisted in daily_plan_snapshots unless the day has been finalized.

Important mismatch: docs/expenditure-algorithm.md says adaptive updates begin at 7 intervals, 4 logged calorie days, and 3 scale measurements, while lib/expenditure.ts currently requires 14-day evidence with 10 intake days and 6 weighed days. Treat code as runtime truth and update the document when the product decision is settled.

The algorithm is explicitly an original estimator informed by published physiology, not a reproduction of another product's proprietary algorithm. It still needs real longitudinal validation before medical or prescriptive claims.

## Nutrition scoring and targets

Main files: lib/nutrition-targets.ts, lib/nutrition-score.ts, lib/nutrient-storage.ts, components/nutrition-home.tsx

Nutrients are grouped into general, carbohydrates, lipids, protein, vitamins, and minerals. Definitions provide canonical units, hierarchy, sort order, target kind, and default target. Users can override targets and choose visible nutrients.

Scoring:

- macro score checks intake against target bands;
- micronutrient score includes only measured positive values, so missing values are not treated as zero intake;
- maximum-style nutrients include alcohol, caffeine, sugars, saturated/trans fat, cholesterol, and sodium;
- food quality is a separate component;
- overall weights are approximately 40 percent macro, 40 percent micronutrient, and 20 percent quality;
- labels are Excellent at 85+, Strong at 70+, Building at 50+, and Needs attention below 50.

The water nutrient/target remains in the data model but is filtered from visible product surfaces while water tracking is disabled.

## Tracking

Canonical storage units:

- water: millilitres;
- activity energy: kilocalories;
- activity duration: minutes;
- weight: kilograms;
- height: centimetres;
- food mass: grams;
- timestamps: ISO timestamps;
- diary grouping: explicit YYYY-MM-DD diary_date based on profile timezone/day-start rules.

Display helpers convert to fl oz, kJ, pounds, stone, feet/inches, and ounces without changing database units.

Validation ranges include:

- water entry 1–5,000 ml;
- activity 1–1,440 minutes and 0–20,000 kcal;
- body weight 20–500 kg;
- height 80–250 cm;
- water goal 250–10,000 ml.

Manual and Apple Health records are distinguished by a source field. Imported health rows use stable fingerprints for deduplication.

## Apple Health through Conduit

This is not a direct Apple HealthKit browser connection. The user installs/configures the third-party Conduit Health Sync iOS app and points it at the webhook.

Flow:

1. The user enables the Apple Health preference.
2. POST /api/me/health-ingest creates an ont_-prefixed bearer token.
3. Only the SHA-256 token hash is stored.
4. Conduit POSTs JSON to /api/health/conduit with the bearer token.
5. The raw delivery is retained in health_sync_events.
6. A payload hash prevents replay duplication.
7. common payload shapes and aliases are normalized.
8. weights are imported into weight_entries, workouts into activity_entries, and other metrics into health_measurements.
9. GET /api/health/conduit reports connection/latest import status.
10. DELETE /api/me/health-ingest revokes access.

Recognized categories include steps, sleep, resting/general heart rate, HRV, active energy, distance, body fat, oxygen saturation, VO2 max, weight, and workouts.

Webhook payload size is capped at 250 KB. Health data is sensitive; do not add logging that exposes bearer tokens or raw payloads.

## Authentication and identity

Authentication is optional.

When Firebase Admin and client configuration are present:

- AppShell checks /api/auth/session;
- unauthenticated visitors see FirebaseAuthGate;
- Google sign-in uses popup with redirect fallback;
- the Firebase ID token is exchanged at POST /api/auth/session;
- the server creates a 14-day Firebase session cookie named ont_firebase_session;
- both session and anonymous cookies are HTTP-only, SameSite=Lax, Secure in production;
- the first authenticated visit links the current anonymous user to Firebase when appropriate, preserving existing diary data;
- sign-out deletes both cookies and reloads.

When Firebase is not configured:

- the app runs in anonymous mode;
- getOrCreateCurrentUser assigns an ont_profile UUID cookie for one year;
- the server creates a user, default profile, preferences, and goals in CockroachDB.

The “Local profile” UI label means “not signed in,” not browser-only storage.

Schema history warning: create-core-schema-v2 adds auth_subject, while create-auth-schema and current authentication code use firebase_uid. Both reflect migration history. Do not consolidate or drop either without inspecting the live schema and existing data.

There is no explicit CSRF-token layer in the route handlers. SameSite cookies and same-origin APIs provide some protection; review this deliberately before exposing new cross-origin mutation flows.

## Partner sharing

Main files: components/sharing-settings.tsx, components/invitation-acceptance.tsx, lib/sharing.ts, lib/share-notifications.ts, and the sharing routes.

Relationships:

- partner;
- family member;
- coach;
- healthcare professional.

Granular permission codes:

- calorie_total;
- macro_totals;
- meal_names_portions;
- water_intake;
- activity;
- weight_trend;
- goal_progress.

Invitation flow:

1. Owner chooses invitee metadata, relationship, and permissions.
2. Server creates a random token, stores only its hash, and sets a 14-day expiry.
3. UI copies the link or opens mailto; there is no transactional email service.
4. Preview validates the token.
5. Accept runs transactionally and creates/updates a profile share and permissions.
6. Owner can renew/cancel pending invitations.
7. Owner can edit active permissions, revoke a share, and optionally enable view alerts.
8. Viewer opens a permission-filtered shared dashboard using the owner's timezone/date.

Share-view push alerts are sent after the dashboard response using Next after(), are best effort, and are throttled to at most once per viewer in six hours. Invalid 404/410 push subscriptions are revoked.

## Web Push and reminders

Main files: lib/notifications.ts, lib/push-delivery.ts, lib/reminders.ts, app/api/push/subscriptions/route.ts, app/api/notifications/dispatch/route.ts, app/sw.js/route.ts

Client:

- permission states are granted, prompt, blocked, install, unsupported, or unconfigured;
- installed-PWA requirements are accounted for;
- the current subscription is cached in localStorage as ont_push_subscription;
- launch synchronization repairs/stores an already-granted subscription;
- subscriptions default to the built-in API but can be delegated through NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT.

Server:

- subscriptions are stored per user and can be revoked;
- VAPID private key and subject are server-only;
- GET /api/notifications/dispatch requires Authorization: Bearer CRON_SECRET;
- it is designed for an external scheduler every five minutes;
- profile timezone and local reminder time decide eligibility;
- at most one daily reminder is delivered per user/local day;
- transient failures are retried up to three total attempts;
- 404/410 endpoints are revoked.

Some reminder copy still mentions water even though water UI is disabled. Keep copy and feature flags aligned when changing water behavior.

## PWA lifecycle

Main files: app/manifest.ts, app/sw.js/route.ts, app/version.json/route.ts, components/pwa-runtime.tsx, lib/pwa.ts, app/pwa.css

Behavior:

- standalone, portrait manifest;
- iOS metadata and safe-area layout;
- standalone viewport-height correction for cold launch;
- visualViewport tracking keeps modal sheets above the software keyboard;
- mobile navigation is hidden while the keyboard is open;
- beforeinstallprompt is captured for a custom install flow;
- service worker checks for updates on launch, focus, pageshow, visibility return, and every minute while visible;
- /version.json is fetched with no-store and compared with the build ID;
- a stale worker gets five seconds to update normally, then registrations and caches are removed once per session and the page reloads;
- notification taps focus an existing client where possible and send in-app navigation;
- the service worker intentionally does not precache the Next application shell;
- navigation requests go to the network.

OCR model assets under /ocr-assets/v1 receive one-year immutable cache headers. Their directory is versioned, so changing bytes requires a new path/version or an intentional cache-busting strategy.

Current installability concern: app/manifest.ts does not declare icons and public/logo.svg is deleted in the working tree. Test install prompts and installed icons before release.

## API inventory

All root APIs are same-origin Next.js route handlers. Unless noted otherwise, they resolve the current user and active profile and use no-store/private behavior where personal data is involved.

| Route | Methods | Responsibility |
|---|---|---|
| /api/auth/session | GET, POST, DELETE | Read Firebase configuration/session; exchange ID token for session cookie; sign out |
| /api/me | GET, PUT | Current profile identity/body fields |
| /api/me/goals | GET, PUT | Goal type, activity, target/weekly rate, calorie/macro/meal/water goals |
| /api/me/preferences | GET, PUT | JSON display, onboarding, reminder, Home, health, appearance settings |
| /api/me/nutrient-goals | GET, PUT | Per-profile nutrient target overrides |
| /api/me/visible-nutrients | GET, PUT | Ordered per-user nutrient visibility |
| /api/me/health-ingest | POST, DELETE | Create or revoke Conduit bearer token |
| /api/profiles | GET, POST | List/create owned profiles; infrastructure is mostly hidden in current UI |
| /api/profiles/[id]/select | POST | Change current_profile_id |
| /api/dashboard | GET | One-day meals/totals/scores/plan/water/activity/weight/streak |
| /api/diary | GET, PUT | Read a day; mark/unmark day complete |
| /api/diary/calendar | GET | Month status and totals |
| /api/diary/entries | POST | Add immutable food/portion/nutrition snapshot |
| /api/diary/entries/[id] | PATCH, DELETE | Edit or delete owned diary entry and clear completion |
| /api/foods | GET | Ranked primary catalog search/recent foods |
| /api/foods/[id] | GET | Primary food detail and normalized portions |
| /api/foods/barcode/[barcode] | GET | Local barcode lookup with Open Food Facts fallback |
| /api/mfp-foods | GET | Ranked MFP search |
| /api/mfp-foods/[id] | GET | MFP detail and portions |
| /api/custom-foods | GET, POST | Search/list/create private custom food |
| /api/custom-foods/[id] | GET, PATCH, DELETE | Read/edit/delete owned custom food |
| /api/recipes | GET, POST | List/create profile recipe |
| /api/recipes/[id] | GET, PATCH, DELETE | Read/edit/delete owned recipe |
| /api/scanned-foods | GET, POST | Recent/frequent catalog scans and recording |
| /api/scanned-foods/[id] | GET | Resolve a saved scan into catalog detail |
| /api/vegan/barcode/[barcode] | GET | Vegan dataset match by normalized barcode |
| /api/water | GET, POST | List/add water; UI currently disabled |
| /api/water/[id] | PATCH, DELETE | Edit/delete owned water |
| /api/activities | GET, POST | List/add activity |
| /api/activities/[id] | PATCH, DELETE | Edit/delete owned activity |
| /api/weights | GET, POST | Latest/history and add weight |
| /api/weights/[id] | PATCH, DELETE | Edit/delete owned weight |
| /api/trends | GET | Filled date series, adaptive expenditure, weight, activity, health metrics |
| /api/health/conduit | GET, POST | Connection/import status and authenticated health webhook |
| /api/health/database | GET | Database readiness/name/time diagnostic |
| /api/push/subscriptions | POST, DELETE | Store/update or revoke browser push subscription |
| /api/notifications/dispatch | GET | CRON_SECRET-protected daily reminder delivery |
| /api/sharing | GET | Pending invitations and active incoming/outgoing shares |
| /api/sharing/invitations | POST | Create invitation |
| /api/sharing/invitations/[id] | PATCH, DELETE | Renew/update or revoke an owned invitation |
| /api/sharing/invitations/preview | GET | Validate token and show invitation metadata |
| /api/sharing/invitations/accept | POST | Transactionally accept token |
| /api/sharing/shares/[id] | PATCH, DELETE | Edit permissions/alerts or revoke share |
| /api/sharing/shares/[id]/dashboard | GET | Permission-filtered owner dashboard for viewer |

### Food search ranking

Primary search:

- query length 2–80 characters;
- up to eight tokens;
- normalized food-name and brand matching;
- a small synonym layer;
- typo similarity;
- exact-name, common-food, brand, and catalog boosts;
- current profile's recent/frequent diary history;
- default limit around 12, maximum 25, offset capped at 500;
- private, non-shared-cacheable response.

MFP uses its own generated search_text and trigram index, source portions, and profile-history ranking.

## Database map

Database connection:

- DATABASE_URL is required;
- lib/db.ts creates one process-global pg Pool with maximum size 5;
- CockroachDB TLS options are inferred from the connection URL;
- withDatabaseTransaction wraps BEGIN, COMMIT, and ROLLBACK;
- SQL values are generally parameterized.

The code hard-codes the logical database and schemas:

- food_catalog.app for application data;
- food_catalog.public.typesense_foods for the primary food catalog;
- food_catalog.public.mfp_foods for imported MFP foods.

### Identity and profile

| Table | Purpose |
|---|---|
| users | owner identity, anonymous UUID, Firebase linkage/history |
| profiles | owner-scoped nutrition persona, name, timezone, height, birth date, equation sex |
| user_preferences | user-level JSON preferences plus current_profile_id |
| profile_goals | goal/activity/weight pace/water/calorie/macro/meal splits |
| user_profiles | legacy pre-v2 profile table retained for migration compatibility |
| user_nutrient_goals | legacy JSON nutrient goals |

### Nutrition plan

| Table | Purpose |
|---|---|
| nutrient_definitions | canonical code, name, group, unit, target kind/default, ordering |
| profile_nutrient_targets | normalized per-profile overrides |
| user_visible_nutrients | ordered per-user display selection |
| daily_plan_snapshots | per-profile/day target components and optional finalization |
| diary_day_completions | explicit trustworthy intake-complete dates |

### Diary and user-created food

| Table | Purpose |
|---|---|
| diary_entries | profile/date/meal/source plus immutable detail, portion, mass, and nutrient snapshots |
| custom_foods | private manual/OCR/OFF food definitions |
| recipes | profile recipe name, servings, ingredient snapshots, calculated nutrition |
| scanned_foods | profile/catalog scan frequency and recency shortcut |
| vegan_products | imported vegan source metadata and canonical barcode |

### Tracking and health

| Table | Purpose |
|---|---|
| water_entries | profile/day/time/ml/source |
| activity_entries | profile/day/time/name/duration/kcal/source/health fingerprint |
| weight_entries | profile/time/kg/source/health fingerprint |
| health_ingest_tokens | hashed Conduit tokens and revocation |
| health_sync_events | retained deliveries, payload hash, state, summary/error |
| health_measurements | normalized metric/value/unit/time/fingerprint |

### Notifications and sharing

| Table | Purpose |
|---|---|
| push_subscriptions | per-user endpoint and Web Push keys with revocation |
| reminder_deliveries | local-date idempotency, status, attempts, response/error |
| sharing_invitations | owner profile, invitee metadata, relationship, token hash, status/expiry |
| sharing_invitation_permissions | permissions attached before acceptance |
| profile_shares | active owner-profile to viewer-user relationship and alert setting |
| profile_share_permissions | permissions attached after acceptance |
| share_view_events | view audit/throttle timestamps |

### Migration strategy

There is no migration framework or schema-version table. scripts/*.mjs are manually run, mostly idempotent setup/ALTER scripts.

The expected evolution is:

1. original users/profile/diary/tracking/custom-food/recipe/preference tables;
2. create-core-schema-v2 to add profiles, goals, nutrient tables, snapshots, sharing, Snack, profile_id, and backfills;
3. feature migrations for auth, search indexes, flexible portions, scanned foods, OCR fields, health, notifications, and sharing.

create-core-schema-v2 assumes several legacy tables already exist and joins user_profiles during backfill. On a completely empty database, blindly running only the v2 script may fail. Inspect and test bootstrap order before automating deployment.

Catalog indexing scripts temporarily unlock schema_locked catalog tables, add generated normalized search_text columns and GIN trigram indexes, then restore the lock. Treat catalog schema changes as operational migrations.

## Preferences, caches, cookies, and events

### Main app

| Name | Type | Purpose |
|---|---|---|
| ont_firebase_session | HTTP-only cookie | 14-day Firebase application session |
| ont_profile | HTTP-only cookie | anonymous user UUID, one year |
| ont:appearance-preferences:v1 | localStorage | early theme/accent |
| ont_push_subscription | localStorage | last serialized push subscription |
| ont_sw_healed | sessionStorage | prevents stale-worker reload loop |
| ont_legacy_icon_cache_purged_v1 | localStorage | one-time old cache cleanup |
| nutritracker-ocr-models-v1 | Cache Storage | OCR model bytes |
| ont:navigate | window event | service-worker/deep-link navigation |
| ont-tracking-updated | window event | invalidate tracking/diary summaries |
| ont-visible-nutrients | window event | refresh nutrient presentation |

### paired app

| Name | Type | Purpose |
|---|---|---|
| paired_access | localStorage | JWT access token |
| paired_refresh | localStorage | JWT refresh token |
| paired_theme | localStorage | selected palette |
| paired_install_snoozed | localStorage | install-prompt snooze |
| paired_sw_healed | sessionStorage | stale-worker loop guard |
| paired-navigate | service-worker message | in-app notification routing |

## Environment-variable map

Never put real values in this document or in prompts.

### Primary public/build variables

- NEXT_PUBLIC_BUILD_ID
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_CUSTOM_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_LABEL_SCANNER_ENABLED
- NEXT_PUBLIC_WEB_PUSH_VAPID_KEY
- NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT

### Primary server-only variables

- DATABASE_URL
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- WEB_PUSH_VAPID_PRIVATE_KEY
- WEB_PUSH_VAPID_SUBJECT
- CRON_SECRET

### Build-host fallbacks

- VERCEL_GIT_COMMIT_SHA
- GITHUB_SHA
- COMMIT_SHA
- NODE_ENV

### paired variables

- VITE_API_URL
- VITE_FB_API_KEY
- VITE_FB_AUTH_DOMAIN
- VITE_FB_PROJECT_ID
- VITE_FB_STORAGE_BUCKET
- VITE_FB_SENDER_ID
- VITE_FB_APP_ID
- VITE_FB_VAPID_KEY

README currently tells the user to copy .env.example, but that file is deleted in this working tree. Recreate a safe names-only example before expecting a new developer to follow setup.

## Build, deployment, and verification

Root commands:

- npm run dev
- npm run lint
- npm run build
- npm run start
- npm run test:nutrition-label
- npm run db:* for one-off schema/index/import tasks

GitHub Actions runs npm ci and npm run build on pushes to main and pull requests using Node 22. There is no automated database migration or deployment test in CI.

next.config.ts:

- React strict mode;
- firebase-admin externalized from the server bundle;
- unique build ID from explicit env, host commit env, or timestamp;
- immutable OCR headers;
- Firebase helper rewrites hard-coded to health-6d09b.firebaseapp.com.

Latest verification of this exact working snapshot:

- root npm run lint: passed;
- root nutrition-label tests: 4 passed;
- root npm run build: passed, including all 44 API route files;
- paired app TypeScript application config: passed;
- paired Vite config TypeScript check: passed;
- paired production Vite/PWA build to a temporary directory: passed;
- paired npm install audit reported 1 moderate and 5 high dependency vulnerabilities; no automatic fix was applied.

The paired build was directed to /tmp so committed paired/dist artifacts were not overwritten.

## Known inconsistencies and sharp edges

1. Branding is mixed. README, layout metadata, auth gate, and manifest use MyFitnessTracker, while onboarding and the repository path use OpenNutriTracker.
2. The root working tree is mostly uncommitted. GitHub main does not represent the mapped state.
3. .env.example is deleted although README references it.
4. public/logo.svg is deleted and the main manifest currently has no icon declarations.
5. Water remains fully modeled but is globally hidden. Some reminder copy still mentions water.
6. Multiple-profile APIs exist, but profile-switching UI is intentionally hidden.
7. The language setting changes formatting locale, not interface translations.
8. Adaptive-expenditure thresholds in docs do not match current code.
9. The expenditure type supports body-fat percentage, but the current profile and onboarding flow do not collect it.
10. Schema/auth history contains both auth_subject and firebase_uid approaches.
11. Migrations are ad hoc and have no central applied-version ledger.
12. GET /api/dashboard can write a daily plan snapshot.
13. Some settings save buttons are closure/confirmation controls because autosave already performed the mutation.
14. Anonymous “local” users still depend on the server database and cookie continuity.
15. Open Food Facts is the only live third-party food fallback and needs network/error resilience.
16. On-demand OCR helper modules still require jsDelivr even though models and WASM are local.
17. Large immutable OCR assets total roughly 65 MB; background warming affects bandwidth and storage.
18. Root-level sample.mp4, sample_part_aa, sample_part_ab, and manifest.mpd are not referenced by source code and look like unrelated download/media artifacts.
19. lib/mock-data.ts and lib/expenditure-demo.ts are not imported by the current application and appear to be leftover/demo helpers.
20. paired/README.md is stale: it refers to cd frontend, a sibling Django backend, and Netlify, while the actual folder is paired and includes Vercel configuration.
21. paired is not part of root lint/build/CI.
22. paired stores JWTs in localStorage, unlike the root app's HTTP-only session cookies.
23. The root has only one focused unit-test file; most APIs and UI flows lack automated tests.
24. No end-to-end browser test suite is present.
25. No live database schema/data check was performed for this map; database notes come from current code and migration scripts.

## Change-impact map

Use this before editing.

| Requested change | Inspect first | Usually also affected |
|---|---|---|
| Main navigation/add menu | components/app-shell.tsx | app/globals.css, app/pwa.css, deep links, service worker |
| Today card/layout | components/home-view.tsx | /api/dashboard, nutrition-home, expenditure-card, CSS |
| Diary behavior | components/diary-view.tsx | diary routes, food-picker, completion table, daily-plan |
| Food search ranking | /api/foods, /api/mfp-foods | food-catalog libs, search-index scripts, diary history |
| Portion or serving math | lib/food-portions.ts | food detail APIs, food-picker, recipe-builder, diary snapshots |
| Barcode behavior | barcode scanner and barcode API | Open Food Facts custom-food creation, scanned foods, vegan lookup |
| Label OCR | nutrition-label scanner/parser/assets | OCR public files, scanner migration, tests, CSP/network assumptions |
| Custom food fields | custom-food lib/components/routes | enable-nutrition-label-scanner migration, diary picker |
| Recipes | recipe-builder and recipe routes | food portions, settings UI, diary picker |
| Calorie target | expenditure, calorie-plan, daily-plan | onboarding plan, dashboard/trends, docs, snapshot schema |
| Nutrition score/targets | nutrition-score and nutrition-targets | nutrient storage, me nutrient/visibility APIs, Today/settings |
| Weight/activity/water | tracking routes and dialogs | AppShell, TrackingManager, dashboard, trends, health import |
| Units/day start | user-preferences and water-units | AppShell, onboarding, every entry form, diary/trends date queries |
| Theme/accent | appearance-preferences, AppShell | globals CSS variables, onboarding/settings |
| Firebase sign-in | firebase client/admin, auth route, current-user | next rewrites, users schema, auth gate |
| Anonymous identity | current-user | every personal API, cookies, profile bootstrap |
| Apple Health import | health-import and health routes | schema, Apple Health section, trends, activity/weight dedup |
| Push/reminders | notifications, reminders, push-delivery | service worker, preference UI, notification schema, scheduler |
| Sharing permissions | sharing lib/routes | both sharing components, SQL query filtering, push view alerts |
| PWA install/update | pwa runtime/service worker/manifest/version | next config, pwa.css, asset caching, notification navigation |
| Database bootstrap | all scripts, especially core-v2 | current-user assumptions, live information_schema, README |
| paired couples product | only paired/* | external Django API contract and Firebase FCM |

## Rules worth preserving during future work

- Keep primary-app data profile-scoped, even while profile switching is hidden.
- Keep diary source and nutrition snapshots immutable.
- Never fabricate grams when a source serving lacks mass.
- Convert display units only at input/output boundaries; keep canonical database units.
- Use diary_date rather than deriving historical grouping from the viewer's current timezone.
- Only completed diary days count as adaptive-expenditure intake evidence.
- Do not add wearable “calories burned” directly to TDEE; current health signals influence confidence/responsiveness.
- Treat zero/missing micronutrients carefully; absence of data is not confirmed zero intake.
- Treat a vegan dataset miss as unknown, not non-vegan.
- Keep label images on device unless the product explicitly changes its privacy contract.
- Hash new invitation/ingest secrets; do not persist raw bearer tokens.
- Filter shared-dashboard SQL and response shape by permissions, not only the UI.
- Push failures must not make core user actions fail.
- Preserve PWA build-version recovery and avoid stale shell caching.
- Avoid editing paired when a request concerns the nutrition app.
- Run lint, focused tests, and a production build after meaningful root changes.
- Re-check git status and preserve unrelated uncommitted work.

## Repository and file inventory

The following inventory describes source and configuration files. Generated .next, node_modules, paired/node_modules, and paired/dist contents are intentionally excluded.

### Root configuration and artifacts

| File | Role |
|---|---|
| README.md | Current setup and feature overview |
| PROJECT_MAP_FOR_CHATGPT.md | This handoff/orientation map |
| package.json / package-lock.json | Root runtime, scripts, exact dependency graph |
| tsconfig.json | Strict Next TypeScript; excludes paired |
| eslint.config.mjs | Next core-vitals/TS lint; excludes paired and generated OCR runtime |
| next.config.ts | build IDs, OCR headers, Firebase helper rewrites |
| next-env.d.ts | generated Next TypeScript declarations |
| .gitignore | ignores root outputs/env, but not nested paired/node_modules |
| .github/workflows/build.yml | Node 22 production-build CI |
| .env.local | local secrets; never share |
| .vercel/project.json | local Vercel project link; ignored |
| manifest.mpd | unreferenced root DASH media manifest, likely unrelated |
| sample.mp4 | unreferenced large media artifact |
| sample_part_aa / sample_part_ab | unreferenced media fragments |

### app files

| File | Role |
|---|---|
| app/layout.tsx | metadata, local font, PWA runtime, global style imports |
| app/page.tsx | renders AppShell |
| app/manifest.ts | main web-app manifest |
| app/sw.js/route.ts | generated service worker with push/navigation behavior |
| app/version.json/route.ts | no-store build identity |
| app/globals.css | main design system and component/layout styles |
| app/pwa.css | installed/mobile PWA shell, safe-area, keyboard behavior |
| app/interaction-fixes.css | targeted interaction fixes |
| app/settings-layout-fix.css | settings-specific layout overrides |
| app/apple-health.css | Conduit/Health section styling |
| app/expenditure.css | expenditure card styling |
| app/adaptive-budget.css | adaptive calorie budget styling |

### components

| File | Role |
|---|---|
| components/app-shell.tsx | root client controller, tabs, global state, overlays, bootstrap |
| components/home-view.tsx | Today dashboard |
| components/diary-view.tsx | diary calendar/day, meals, completion |
| components/trends-view.tsx | time-range trends and charts |
| components/profile-view.tsx | profile/account hub |
| components/settings-view.tsx | settings router and editors |
| components/onboarding-flow.tsx | six-step first-run setup |
| components/food-picker.tsx | federated food search, portions, barcode/OCR entry |
| components/barcode-camera-scanner.tsx | ZXing camera barcode reader |
| components/nutrition-label-scanner.tsx | PaddleOCR camera/upload/manual review workflow |
| components/vegan-scanner.tsx | vegan-dataset barcode UI |
| components/recipe-builder.tsx | ingredient search, calculation, recipe create/edit |
| components/activity-entry-dialog.tsx | activity create form |
| components/weight-entry-dialog.tsx | weight create form |
| components/tracking-manager.tsx | tracking history edit/delete |
| components/apple-health-section.tsx | Conduit connection, instructions, status |
| components/sharing-settings.tsx | invites, connections, permissions, shared dashboard |
| components/invitation-acceptance.tsx | token preview and acceptance overlay |
| components/firebase-account.tsx | account setting and signed-out auth gate |
| components/nutrition-home.tsx | score and nutrient-target presentation |
| components/expenditure-card.tsx | adaptive-estimator readiness/explanation |
| components/charts.tsx | lightweight SVG line and donut charts |
| components/date-of-birth-fields.tsx | safe date input helper |
| components/ui.tsx | small Card, title, progress, icon primitives |

### lib

| File | Role |
|---|---|
| lib/db.ts | CockroachDB pool/query/transaction primitives |
| lib/current-user.ts | Firebase/anonymous identity and active-profile bootstrap |
| lib/firebase-admin.ts | server token/session verification |
| lib/firebase-auth.ts | client Google sign-in and token exchange |
| lib/user-preferences.ts | preference parsing, units, date/day-start helpers |
| lib/appearance-preferences.ts | early theme/accent cache and DOM application |
| lib/water-units.ts | ml/fl-oz conversion and formatting |
| lib/meal-time.ts | current-clock meal section |
| lib/ui-features.ts | global water visibility feature flag |
| lib/food-catalog.ts | primary food detail row serialization |
| lib/mfp-food-catalog.ts | MFP detail serialization |
| lib/food-portions.ts | cross-source portion normalization/scaling |
| lib/custom-food.ts | custom-food validation/serialization/snapshots |
| lib/nutrition-label.ts | deterministic OCR table parser/reconciler |
| lib/nutrition-ocr-assets.ts | local OCR asset prefetch/cache scheduler |
| lib/nutrition-targets.ts | definitions, defaults, target grouping |
| lib/nutrient-storage.ts | synchronize definition rows to database |
| lib/nutrition-score.ts | macro/micro/quality scoring |
| lib/onboarding-plan.ts | initial automatic plan preview |
| lib/expenditure.ts | adaptive energy estimator |
| lib/calorie-plan.ts | expenditure-to-calorie/macro target math |
| lib/daily-plan.ts | evidence loading and daily snapshot persistence |
| lib/apple-health.ts | metric category/type definitions used by UI |
| lib/health-import.ts | normalize Conduit payloads/workouts/measurements |
| lib/notifications.ts | client Web Push subscription lifecycle |
| lib/push-delivery.ts | server VAPID setup and send wrapper |
| lib/reminders.ts | timezone-aware daily reminder dispatcher |
| lib/sharing.ts | sharing permission/relationship constants and guards |
| lib/share-notifications.ts | best-effort owner view alerts |
| lib/pwa.ts | install prompt, viewport fixes, update/heal lifecycle |
| lib/mock-data.ts | currently unused original UI mock data |
| lib/expenditure-demo.ts | currently unused synthetic estimator demonstration |

### scripts

| File | Role |
|---|---|
| scripts/create-core-schema-v2.mjs | profile-aware v2 schema/backfill and major compatibility migration |
| scripts/create-auth-schema.mjs | Firebase columns/index |
| scripts/create-profile-schema.mjs | legacy user_profiles |
| scripts/create-preferences-schema.mjs | user preference JSON |
| scripts/create-diary-schema.mjs | legacy diary foundation |
| scripts/create-diary-completion-schema.mjs | completed-day evidence |
| scripts/create-tracking-schema.mjs | water/activity/weight |
| scripts/create-custom-foods-schema.mjs | custom foods |
| scripts/create-recipes-schema.mjs | recipes |
| scripts/create-nutrient-goals-schema.mjs | legacy nutrient-goal JSON |
| scripts/create-scanned-foods-schema.mjs | recent/frequent scans |
| scripts/create-health-schema.mjs | health token/event/measurement and fingerprints |
| scripts/create-notification-schema.mjs | subscriptions and reminder deliveries |
| scripts/create-sharing-schema.mjs | invites, shares, permissions, view events |
| scripts/add-food-search-index.mjs | basic primary catalog index |
| scripts/add-smart-food-search-index.mjs | normalized primary trigram search |
| scripts/enable-flexible-food-portions.mjs | diary snapshots/null grams and MFP search |
| scripts/enable-nutrition-label-scanner.mjs | custom food basis/source/barcode/volume fields |
| scripts/import-vegan-products.mjs | streaming vegan CSV import and match report |

### Tests and documentation

| File | Role |
|---|---|
| tests/nutrition-label.test.ts | four deterministic parser/reconciliation tests |
| docs/expenditure-algorithm.md | equations, causal timing, research basis, validation caveats |

### Public assets

| Path | Role |
|---|---|
| public/fonts/Nunito.ttf | main local typeface |
| public/images/avatar.jpg | profile/avatar fixture |
| public/images/bowl.jpg | mock meal image |
| public/images/salmon.jpg | mock meal image |
| public/images/apple.jpg | mock meal image |
| public/ocr-assets/v1/models/* | PP-OCRv6 detection/recognition archives |
| public/ocr-assets/v1/ort/* | ONNX Runtime loader/WASM |
| public/ocr-assets/v1/paddleocr-worker.js | OCR worker bootstrap/cache bridge |
| public/ocr-assets/v1/worker-entry-C9UNuyOJ.js | bundled OCR worker entry |
| public/ocr-assets/v1/worker-fetch-cache.js | worker cache fetch helper |

## paired application map

paired is a separate product and should be treated as an isolated subtree.

### Product behavior

Primary tabs:

- Home/Main;
- Activities/Topics;
- Discuss;
- Us/Profile.

Unpaired users can still browse content. Pairing unlocks comparison and shared flows.

Home provides a daily shared item with answer-then-reveal and access to:

- questions;
- packs;
- journeys;
- quizzes;
- games;
- tips.

The current source references large catalog counts: about 1,447 questions, 484 games, 528 quizzes, 221 packs, 16 journeys, and 257 tips. These values come from frontend presentation and ultimately depend on the missing backend dataset.

Experiences:

- Question: free-text answer, reveal, partner comparison, thread messages.
- Pack: sequential open prompts and answers.
- Quiz: Likert-style responses, notes, and comparisons.
- Game: several answer/guess and You-or-Me modes with scores.
- Journey: multi-day mixed content, one active journey, per-partner progress.
- Tip: rich HTML guidance and optional partner exercise.
- Discuss: combined activity feed filtered by your turn, partner turn, or all.
- Notes: shared sticky-note board with colors, pinning, reminders, and edits.
- Workday: partner shift patterns, timezone, messages, calculated send times, and test delivery.
- Us: identity, couple title, anniversary/timeline, scoped facts, pairing, notifications, nutrition goals, themes, and workday settings.

A food diary implementation remains in paired/src/screens/DiaryScreen.tsx and API types, but its entry point is commented out in ExploreScreen. It is not the same diary as the root nutrition app.

### paired architecture

- paired/src/api.ts is the complete typed HTTP contract and JWT refresh wrapper.
- Access and refresh JWTs are stored in localStorage.
- A 401 attempts one transparent refresh and retries.
- Authentication supports username/password, email OTP, Google, and a shared demo guest.
- paired/src/query.ts provides a small stale-while-revalidate cache, concurrent-request deduplication, invalidation, optimistic writes, and foreground refetch.
- paired/src/router.ts maps custom history/deep links and makes overlays honor browser Back.
- paired/src/navigation.ts normalizes notification URLs from startup or service-worker messages.
- Firebase FCM is optional and only acts as the delivery doorbell; notification content/state is server-backed.
- Vite PWA precaches the shell, cleans old caches, excludes the Firebase messaging worker, stamps version.json, and heals stuck service workers.

This differs from the root PWA, which deliberately does not cache its application shell.

### paired API contract

Expected Django endpoints include:

- auth register/login/request-code/verify-code/google/guest/me;
- pairing create/accept/unpair;
- daily item and shuffle;
- answer submit/state;
- bookmarks list/check/toggle;
- nudges send/inbox/read;
- content messages list/send;
- content collection list/detail;
- journey state/start/leave;
- public categories;
- couple activity;
- fact CRUD;
- note CRUD;
- diary day/summary/CRUD;
- shift schedule get/save/send-now;
- device token registration for FCM.

None of these backend implementations are present here.

### paired file inventory

| File | Role |
|---|---|
| paired/package.json / package-lock.json | separate dependencies/build |
| paired/vite.config.ts | React/Tailwind/PWA/version build |
| paired/vercel.json | SPA rewrites and cache headers |
| paired/index.html | boot theme and app mount |
| paired/README.md | stale frontend/backend/deploy notes |
| paired/tsconfig*.json | app and Vite TypeScript projects |
| paired/src/main.tsx | boot, PWA update and stale-worker recovery |
| paired/src/App.tsx | tab shell and high-level overlay/navigation state |
| paired/src/api.ts | API types, JWT storage/refresh, endpoint client |
| paired/src/auth.tsx | authentication context and pairing polling |
| paired/src/config.ts | VITE_API_URL |
| paired/src/firebase.ts | optional Firebase/Google/FCM configuration |
| paired/src/notifications.ts | FCM permission/token registration |
| paired/src/install.ts | install prompt and iOS/snooze handling |
| paired/src/navigation.ts | push target parser/dispatcher |
| paired/src/router.ts | custom tab/screen history integration |
| paired/src/query.ts | SWR-like memory cache |
| paired/src/personalize.ts | partner/name copy helpers |
| paired/src/shifts.ts | work-shift types, defaults, time calculations |
| paired/src/theme.ts | Rosé, Ocean, Lavender, Sunset, Forest, Midnight palettes |
| paired/src/ui.tsx | shared UI primitives |
| paired/src/index.css | Tailwind import, theme variables, animations/components |
| paired/src/globals.d.ts | Vite/PWA/build-ID declarations |
| paired/src/screens/AuthScreen.tsx | login/register/OTP/Google/demo |
| paired/src/screens/PairingScreen.tsx | create/accept couple code |
| paired/src/screens/ExploreScreen.tsx | Home, daily item, collections, search/filter routing |
| paired/src/screens/DiscussScreen.tsx | turn-based activity feed |
| paired/src/screens/ProfileScreen.tsx | couple/account/facts/settings hub |
| paired/src/screens/NotificationsScreen.tsx | nudge/inbox history |
| paired/src/screens/NotesBoard.tsx | shared notes |
| paired/src/screens/WorkdayScreen.tsx | schedule/message configuration |
| paired/src/screens/QuestionExperience.tsx | open-answer/reveal flow |
| paired/src/screens/PackExperience.tsx | pack sequence |
| paired/src/screens/QuizExperience.tsx | Likert quiz/comparison |
| paired/src/screens/GameExperience.tsx | multi-mode games/comparison |
| paired/src/screens/JourneyExperience.tsx | multi-day journey state |
| paired/src/screens/TipContent.tsx | rich tip/exercise |
| paired/src/screens/DiaryScreen.tsx | currently hidden couples food/exercise diary |
| paired/src/screens/InstallPrompt.tsx | custom install education/prompt |
| paired/public/firebase-messaging-sw.js | FCM background notification worker |
| paired/public/icon-192.png | PWA icon |
| paired/public/icon-512.png | PWA/maskable icon |
| paired/public/apple-touch-icon.png | iOS icon |

## How ChatGPT should approach a future change

1. Confirm whether the request targets the root nutrition app or paired.
2. Read this map, then read every file in the relevant “Inspect first” row.
3. Trace the UI call through its route, server helper, tables, and invalidation/event path.
4. Check canonical units, profile/user scoping, timezone/day-start behavior, snapshot immutability, and permissions.
5. Identify whether a migration is needed; never assume the live database exactly matches scripts.
6. Preserve anonymous and Firebase modes unless the request explicitly changes access policy.
7. Include loading, empty, error, retry, offline/PWA, mobile safe-area, and dark-theme states.
8. Update nearby docs/tests when behavior or thresholds change.
9. Run the narrowest focused checks, then root lint and production build.
10. Report changed files, behavior, schema/config steps, verification, and any remaining risks.

## Short handoff checklist for the user

Before moving fully to ChatGPT Web:

- Commit or otherwise back up the current dirty working tree.
- Push it to a branch ChatGPT can access, or create a source-only archive.
- Include this map.
- Exclude .env.local and generated/dependency directories.
- Decide whether paired and the large root media artifacts belong in the long-term repository.
- Recreate a safe .env.example.
- Keep the root and paired products clearly separated in every request.
