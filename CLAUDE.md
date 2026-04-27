# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development commands

All frontend commands run from `frontend/`:

```bash
npm run dev          # Vite dev server with HMR (proxies /api/ to PHP)
npm run build        # vue-tsc type-check + Vite production build
npm run type-check   # Type-check only (vue-tsc)
npm run lint         # oxlint + eslint (both with --fix)
npm run format       # Prettier
npm run test:unit    # Vitest
npm run test:e2e     # Playwright
```

Backend (PHP, from repo root):

```bash
php -S localhost:8000   # Local API server (port must match VITE_PHP_SERVER or default 8000)
```

Local dev uses two servers simultaneously: Vite on `:5173`, PHP on `:8000`. The Vite proxy config in `frontend/vite.config.ts` forwards `/api/`, `/validate_pin.php`, and `/llm_proxy.php` to the PHP server.

---

## Architecture

### Two-layer stack

**Frontend** — Vue 3 SPA (`frontend/src/`) built with Vite. Single `index.html` entry point; history-mode routing; deployed to `frontend/dist/`. Apache `.htaccess` is auto-generated at build time by a Vite plugin in `vite.config.ts` — it sets `RewriteBase` from `VITE_APP_BASE` and routes all non-file requests to `index.html`.

**Backend** — Flat PHP 8 files under `api/`. No framework. Every endpoint is a standalone `.php` file that requires `api/common.php` (which in turn loads `bootstrap.php` → `config.php`). SQLite databases are initialized and migrated automatically by `bootstrap.php` on first access via the DB accessor functions.

### Authentication flow

All roles share the same JWT mechanism. `api/jwt.php` signs/verifies HS256 tokens using `JWT_SECRET`. Tokens carry `user_id`, `user_type` (`employee | supervisor | admin | superadmin`), and `company_id` (0 for superadmin). Tokens expire after 7 days.

Every protected PHP endpoint calls one of the `require*()` guards in `api/common.php` at the top of the file. These verify the Bearer token AND confirm the record still exists and is active in the DB.

On the frontend, `stores/auth.ts` persists token + user object in `localStorage`. `composables/useApi.ts` injects the `Authorization: Bearer` header on every request. The router guard in `router/index.ts` enforces role-based access — `/admin` must be defined before `/:slug` in the route list so the static path wins over the dynamic one.

**Login types and their routes:**

| Route | Login type | Auth method |
|---|---|---|
| `/:slug` | employee | PIN via `validate_pin.php` |
| `/:slug/approval` | supervisor | PIN via `validate_pin.php` |
| `/:slug/admin` | company admin | email + password via `api/admin_login.php` |
| `/admin` | superadmin | email + password via `api/admin_login.php` |

PIN hashing: employee and supervisor PINs are stored as `HMAC-SHA256(pin, JWT_SECRET)` — see `hashPin()` in `bootstrap.php`. They are never returned by any API endpoint.

### i18n

Locale files live in `locales/` at the repo root as flat dot-notation JSON (e.g. `"employee.tabs.log": "Log hours"`). `frontend/src/i18n.ts` expands these to nested objects at startup using the `expand()` helper. Adding a new locale requires only a new JSON file — no code changes. `useLocale.ts` composable watches `auth.user.uiLanguage` and updates the global vue-i18n locale reactively.

### Salaxy API integration

Per-company Salaxy credentials (`salaxy_api_url`, `salaxy_username`, `salaxy_password`) are stored in the `companies` table. The backend fetches an OAuth2 password-grant token from Salaxy's token endpoint and caches it per company in `data/salaxy_token_{companyId}.json` for 23 hours. This cached token is used for employee sync and payroll export calls.

### Config and secrets

`config.php` reads from environment variables first; falls back to constants defined in `config.local.php` (gitignored). For local dev, copy `config.local.php.example` to `config.local.php`. Required variables: `JWT_SECRET`, `GEMINI_API_KEY`. Salaxy credentials are per-company in the DB, not global config (except `SALAXY_*` env vars which are legacy defaults).

### Database layout

Two SQLite files, both under `data/`. Accessors in `bootstrap.php`: `getMasterDb()`, `getCompanyDb(int $id)`, `getCompanyDbBySlug(string $slug)` — all static-cached per request.

**`data/master.sqlite`** — company registry and super-admin accounts:
- `companies` — slug, active flag, per-company Salaxy credentials, payroll settings, `db_file` path
- `super_admin_orgs` — super-admin organizations (one default org)
- `super_admins` — super-admin accounts (reference `super_admin_orgs`)

**`data/companies/{id}.sqlite`** — one file per company, all operational data:
- `company_admins` — company-level admins (`role='company_admin'`)
- `employees` / `supervisors` — PIN (HMAC hash), `salaxy_employment_id` for sync
- `time_entries` — status: `pending | approved | rejected`; `hours` and `km` are separate approval targets; `exported_to_salaxy` flag
- `payroll_exports` — deduplication guard for Salaxy payroll creation
- `pin_rate_limit` — per-device brute-force protection

Schema migrations run inline in `bootstrap.php` via `ALTER TABLE` checks on every request — check there before adding columns. To split a legacy single-file `data/app.sqlite` into the new layout, run `php migrate.php` (idempotent).

### Production deployment

Railway (PHP built-in server via `nixpacks.toml`) serves the backend. The frontend is separately built and deployed to an Apache server via `deploy-frontend.sh`, which rsyncs `frontend/dist/` to a remote path derived from `VITE_APP_BASE` in `frontend/.env.production`. CORS allowed origins are hardcoded in `api/cors.php`.

---

## Instructions

- In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.
- Do not make any changes until you have 95% confidence in what you need to build. Ask me follow-up questions until you reach that confidence.
- Do not change the formatting of existing files. This includes line endings, character encoding, indentation style, trailing whitespace, and BOM markers. Edits must be surgical — only the intended content should change.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
