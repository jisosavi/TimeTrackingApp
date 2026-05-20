# TimeTrackingApp — Frontend

Vue 3 + TypeScript SPA. Built with Vite, Pinia, Vue Router, Tailwind CSS v4, and shadcn-vue components.

## Local development

### Prerequisites

- Node.js 20+
- The Deno backend running on port 8080 (see `backend/README.md`)

### Install dependencies

```bash
cd frontend
npm install
```

### Environment — `.env.local`

`.env.local` is already in the repo with a default pointing to `http://localhost:8080`:

```
VITE_API_SERVER=http://localhost:8080
```

Change the port here if you run the backend on a different port.

### Start the dev server

```bash
npm run dev
```

Starts Vite on `http://localhost:5173`. The proxy in `vite.config.ts` forwards `/v01` to the backend automatically — no CORS issues in local dev.

---

## Testing

All commands run from `frontend/`:

```bash
npm run type-check   # vue-tsc — type errors only, no emit
npm run lint         # oxlint + eslint (both with --fix)
npm run format       # Prettier
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests (requires dev server running)
```

---

## Deploying to Apache (isosavi.com)

### Prerequisites

- SSH access to the cPanel server
- `rsync` available locally
- `.env.production` filled in (copy from `.env.production.example`)

### 1. Configure `.env.production`

```bash
cp frontend/.env.production.example frontend/.env.production
```

Edit the file:

```
# Full URL of the Railway backend service — no trailing slash
VITE_API_BASE=https://your-app.up.railway.app

# Sub-path where the Vue app is served on Apache
# Must start and end with /
VITE_APP_BASE=/your/subpath/
```

### 2. Run the deploy script

From the repo root:

```bash
export CPANEL_USER=your-cpanel-username
./deploy-frontend.sh
```

The script:
1. Runs `npm run build` (type-check + Vite production build)
2. Generates `.htaccess` in `dist/` with the correct `RewriteBase`
3. `rsync`s `frontend/dist/` to `public_html/<subpath>/` on the server

The site goes live at `https://isosavi.com<VITE_APP_BASE>` immediately after rsync completes.

### Apache requirements

The server must have `mod_rewrite` enabled. The generated `.htaccess` routes all non-file requests to `index.html` so Vue Router history mode works correctly.

---

## Structure

```
frontend/
├── vite.config.ts       # Proxy config, base path, .htaccess generation plugin
├── locales/             # Flat JSON locale files (en, fi, sv, et, uk, xh)
└── src/
    ├── router/index.ts  # All routes + JWT navigation guards
    ├── stores/auth.ts   # Pinia auth store (token + user in localStorage)
    ├── i18n.ts          # vue-i18n setup, expands flat locale keys to nested
    ├── composables/
    │   ├── useApi.ts    # Central auth-injecting fetch wrapper (get/post/patch/del)
    │   └── ...
    ├── views/           # One file per page
    └── components/      # employee/, super-admin/, ui/ (shadcn-vue primitives)
```

### Adding a locale

Drop a new `<code>.json` file into `frontend/locales/` following the same flat dot-notation keys as the existing files. No code changes required — `i18n.ts` picks it up automatically.
