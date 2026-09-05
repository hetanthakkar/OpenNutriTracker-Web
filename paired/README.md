# Paired clone — PWA frontend

React 19 + Vite 7 + Tailwind 4, installable PWA (vite-plugin-pwa, autoUpdate),
Firebase Cloud Messaging for push. Talks to the Django backend in `../backend`.

## The couple experience

- **Auth** — register / log in (JWT, auto-refreshed).
- **Pairing** — create a code or enter your partner's; links you into a couple.
- **Today** — the shared daily question with **answer-then-reveal**: you only see
  your partner's answer once you've answered yourself.
- **Explore** — browse all six content collections (questions, packs, journeys,
  quizzes, games, tips) with search → detail.
- **Us** — profile, partner, enable notifications, log out.

## Run locally

```bash
cd frontend
cp .env.example .env          # set VITE_API_URL if backend isn't on :8000
npm install
npm run dev                   # http://localhost:5173
```
Run the backend too (`cd ../backend && python manage.py runserver`). CORS is
open in Django DEBUG mode.

## Build & deploy (Netlify)

```bash
npm run build                 # -> dist/
```
Deploy `dist/` to Netlify (config in `netlify.toml`). Set env vars in Netlify:
`VITE_API_URL=https://<your-render-app>.onrender.com` and the `VITE_FB_*` keys
if using notifications. `public/_headers` keeps the CDN from serving stale
`index.html`/`sw.js` so updates reach installed apps promptly (the Macrocenter
trick), and `src/main.tsx` re-checks for a new service worker on every foreground.

## Notifications (optional)

Push stays disabled until Firebase is configured. To enable:
1. Create a Firebase project, add a Web app, enable Cloud Messaging.
2. Fill `VITE_FB_*` in `.env` and the config block in
   `public/firebase-messaging-sw.js`.
3. The backend already stores device tokens (`POST /api/devices/`); add a
   Firebase Function / server call to actually send pushes (template in the
   Macrocenter repo's `functions/index.js`).

## Structure

```
src/
  api.ts            typed API client (JWT + transparent refresh)
  auth.tsx          auth context/provider
  config.ts         API base URL
  firebase.ts       FCM config from env (gracefully optional)
  notifications.ts  enable push + register device token
  ui.tsx            shared UI primitives (Button, Card, Screen, …)
  App.tsx           shell + bottom-tab navigation
  screens/
    AuthScreen.tsx      login / register
    PairingScreen.tsx   create/enter pairing code
    TodayScreen.tsx     daily question + answer-reveal
    ExploreScreen.tsx   6 collections -> list -> detail
    ProfileScreen.tsx   profile + notifications + logout
```
