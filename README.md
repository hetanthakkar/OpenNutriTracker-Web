# OpenNutriTracker web prototype

A frontend-only Next.js translation of the Flutter app with an installable PWA shell.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

`NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT` is optional until a backend is ready. When configured, it receives `POST`/`DELETE` JSON containing the browser `PushSubscription` and device name.

On Vercel, the update build ID falls back to `VERCEL_GIT_COMMIT_SHA`. On other hosts, set `NEXT_PUBLIC_BUILD_ID` (or provide `COMMIT_SHA`) so every deploy has a distinct ID.

The rest of the prototype still uses static mock data and its existing UI/state.
