# TimeTrackingApp

An easy to use, AI-powered time tracking solution seamlessly integrated with **[Salaxy](https://salaxy.com)**. Salaxy is the real-time, open API payroll platform.

Focus is on usability: easy for employees to log hours and easy for managers to approve!

> **Branches** — Branches are used for development, stability and reliability varies.

## Overview

TimeTrackingApp extends Salaxy's automated payroll capabilities by providing an intuitive time and expense tracking interface for small and medium enterprises. 
Built on Salaxy's powerful Open API, it demonstrates how developers can create value-added solutions that integrate directly with real-time payroll processing.
Support for multiple UI languages, easy to add more locales when needed.

## Key Features

### Very Easy Login and Time Entry
- **Kiosk PIN Pad**: Full-viewport numeric keypad with live clock — works on a shared tablet behind a counter, a phone in portrait, or any browser. Physical keyboard fully supported.
- **Brute-Force Protection**: PIN login is rate-limited per device and per company. Three failed attempts within 60 seconds trigger a 5-minute cooldown shown on screen. A second failure chain after the cooldown permanently locks the account — only a company admin can unlock it.
- **Voice & Text Input**: Employees log hours using conversational AI (text or speech)
- **Smart Interpretation**: AI understands natural language entries like "worked 8 hours on client project today"
- **Preview & Confirm**: AI parses the entry and shows an editable preview card before saving — employees can adjust date, hours, project, or notes before confirming

### Streamlined Approval Workflow
- **Very Easy to Use for Supervisors/Managers**: Manager login with PIN. Works with simple URL on any phone!
- **Manager Review**: Company managers can approve, reject, or request clarification on entries
- **Bulk Actions**: Select multiple entries and approve or reject them in one click with an optional shared rejection note
- **Independent Hours/Mileage Approval**: Entries with both hours and km can be approved or rejected independently
- **Employee Rejection View**: Rejected entries appear in a dedicated tab in the employee UI — employees can read the rejection note and submit a clarification reply for both hours and km rejections independently
- **Expense Management**: Handle both time and expense submissions in one workflow
- **Audit Trail**: Complete history of all submissions and approvals

### Direct Payroll Integration
- **One-Click Sync**: Approved entries flow directly to Salaxy payroll
- **Automatic Payroll Updates**: System generates and updates open payroll periods
- **Real-Time Processing**: Changes reflect immediately in Salaxy's payroll calculations

### Multi-Company Management
- **Super Admin Dashboard**: Manage multiple companies from a centralized interface
- **Automatic Employee Sync**: Employees are synchronized in real-time from Salaxy's payroll system
- **Company-Level Administration**: Each company admin has full control over their workforce

### Multi-Language Support
- UI languages can be added easily — one JSON file per locale, no code changes required
- This package has ENG, FIN, SWE, EST, UKR, isiXhosa locales
- Language is set independently per company, per employee, and per supervisor

## Why Build on Salaxy?

This project showcases the power of Salaxy's modern payroll infrastructure:

- **Open API First**: RESTful, OpenAPI-compliant endpoints make integration straightforward
- **Real-Time Processing**: No batch delays - see changes instantly
- **AI Integrated**: AI helps payroll users and platform is built for the future with Salaxy AI architecture
- **Developer-Friendly**: Comprehensive documentation, test environments, and consistent APIs
- **Break Free from Legacy**: Unlike closed-box solutions, Salaxy empowers developers to innovate

---

## Features

**Employee** (`/{slug}/`)
- Kiosk-style full-viewport PIN pad with live clock; physical keyboard support, auto-submit on last digit, haptic feedback on mobile
- Voice or text input — natural language like *"Yesterday 2h on project Alpha"*
- Gemini AI interprets entries, asks follow-up questions if details are missing, then shows an editable preview card (date, hours, project, notes) before saving
- Three tabs: **Log** (AI chat), **Entries** (full history), **Rejected** (entries needing attention — badge count)
- Rejected tab shows the manager's rejection note per entry; employee can submit a clarification reply for hours and km rejections independently
- Entries exported to Salaxy payroll via API — one payroll created per day, entries added as payslip items
- Mileage allowance (km-korvaus) support with per-type approval tracking
- Type pills on each entry row identify hours vs. kilometre entries at a glance

**Company supervisor** (`/{slug}/approval/`)
- Four tabs: **Review** (pending), **Approved**, **Rejected**, **Team**
- Checkbox selection for bulk approve/reject with optional rejection note; 3-second toast confirmation after bulk action
- Hours and kilometres on the same entry appear as separate approval cards — each can be approved or rejected independently
- Rejected entries carry a per-type rejection note visible to the employee; employee clarification responses are shown on re-review

**Company admin** (`/{slug}/admin/`)
- Four nav tabs: **Export Payroll** (default landing), **Personnel**, **Approvals**, **Settings**
- Manage employees and supervisors: add, edit, deactivate, reset PIN, set UI language per person
- Personnel list shows PIN lock status inline: **Locked** (red badge) for permanently locked accounts and **Cooling down** (amber badge) for accounts in a temporary rate-limit cooldown — each has an **Unlock** button to clear the lock and reset the device rate limit
- Manage teams: assign employees to supervisors
- Sync employees from Salaxy with one click — new employees are imported, existing ones updated
- Payroll dashboard: period summary cards (current month + collapsible previous months), export approved entries to Salaxy with one click
- Configurable payroll period (monthly or fortnightly) with flexible payday settings
- Company Salaxy ID visible in Settings (read-only; editable by super-admins only)

**Super-admin** (`/admin/`)
- Create and manage companies with a slug-based URL and admin account
- Enable or disable time tracking per company via an inline toggle
- Manage admins of each company
- Navigate directly to each company's admin panel

---

## Screenshots (OLD, MUST BE UPDATED!)

**Simple PIN login** — each company has its own login URL at `/{slug}/`.
Employees and managers/supervisors only need to open the URL on any device and give their unique PIN.
Nothing else is needed for onboarding, no configuration or installing anything!

<img src="screenshots/01-pin-login.png" width="260" alt="Employee PIN login">

<img src="screenshots/01-pin-login-2.png" width="260" alt="Employee PIN login">

---

**Time entry** — employees describe their hours in plain language. The AI confirms details and shows a summary before the entry is sent to manager for approval.

<img src="screenshots/02-time-entry.png" width="260" alt="Employee time entry chat UI">

Employees can see the entries they have made and follow the approval process. They can also comment if managers have questions about the entries.

<img src="screenshots/02-time-entry-2.png" width="260" alt="Employee time entry list">

---

**Company admin** — manage employees, reset PINs, and sync from Salaxy. Sync status and timestamp are shown inline next to the sync button.

<img src="screenshots/03-company-admin.png" width="600" alt="Company admin employee list">

---

**Approvals** — supervisors/managers can follow the entries sent by their employees and approve them. They can also ask for more information about the entries.
Managers only need to open the URL on any device and give their unique PIN.
Nothing else is needed for onboarding, no configuration or installing anything!

<img src="screenshots/05-approval.png" width="600" alt="Approval view">

---

**Super-admin** — all companies in one table. The first column toggles time tracking on/off per company without leaving the page.

<img src="screenshots/04-super-admin.png" width="600" alt="Super-admin company list">

---

## Recent Changes

### 2026-04-25
- **PIN security hardening**: Employee and supervisor PINs are now stored as HMAC-SHA256 hashes instead of plain text. The server-side `JWT_SECRET` is used as the HMAC key, so an attacker needs both a database dump *and* the secret to crack any PIN. The migration runs automatically on the next request — no manual steps needed. API endpoints no longer return PIN values; the admin edit form no longer pre-fills the PIN field (leave it blank to keep the existing PIN unchanged).

### 2026-04-24
- **Vue-only deployment at domain root**: Removed all legacy PHP/HTML frontend files (`index.html`, `approval.html`, `router.php`, `admin/`, `company/` directories). The app is now served entirely from the Vue SPA at the domain root. `router.php` is gone — the PHP built-in server no longer needs it for local development.
- **Configurable deploy path via `VITE_APP_BASE`**: `vite.config.ts` reads `VITE_APP_BASE` from `.env.production` to set the Vite base path and auto-generates `dist/.htaccess` with a matching `RewriteBase` at build time. `deploy-frontend.sh` derives the remote `rsync` destination from `VITE_APP_BASE` automatically. See `.env.production.example` for the format.
- **Production domains added to CORS**: `time.salaxy.com` and `test-time.salaxy.com` added to the allowed origins list in `api/cors.php`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript, Vite 8, Composition API (`<script setup>`) |
| UI components | shadcn-vue (Reka UI primitives), Tailwind CSS v4 |
| State management | Pinia |
| Routing | Vue Router 5 (history mode, JWT-guarded navigation guards) |
| i18n | vue-i18n v11 (`legacy: false`), flat JSON locale files in `locales/` |
| Backend | PHP 8+, SQLite via PDO |
| Auth | JWT (HS256), issued per role by PHP, verified on every API call |
| AI | Google Gemini API (natural language → structured time entry) |
| Payroll | Salaxy REST API — OAuth2 token auth, employee sync, payroll export |
| Dev server | Vite dev server (frontend) + PHP built-in server (backend/API) |
| Production | Apache with `.htaccess` rewrites; frontend built to `frontend/dist/` |
| Testing | Vitest (unit), Playwright (e2e), vue-tsc (type-check) |

### Supported languages

| Code | Language |
|---|---|
| `en` | English |
| `fi` | Suomi |
| `sv` | Svenska |
| `et` | Eesti |
| `uk` | Українська |
| `xh` | isiXhosa |

Adding a new locale requires only a new JSON file in `locales/` — no code changes needed. The `expand()` helper in `frontend/src/i18n.ts` converts flat dot-notation keys to the nested structure vue-i18n expects at runtime.

---

## URL Structure

| Path | Description |
|---|---|
| `/{slug}` | Employee PIN login |
| `/{slug}/home` | Employee time entry (authenticated) |
| `/{slug}/approval` | Supervisor/manager PIN login |
| `/{slug}/approval/home` | Supervisor approval portal (authenticated) |
| `/{slug}/admin` | Company admin PIN login |
| `/{slug}/admin/dashboard` | Personnel management (authenticated) |
| `/{slug}/admin/payroll-summary` | Export Payrolls to Salaxy — default admin landing (authenticated) |
| `/{slug}/admin/payroll` | Redirects to `/payroll-summary` |
| `/{slug}/admin/payroll-settings` | Payroll period settings (authenticated) |
| `/admin` | Super-admin login |
| `/admin/dashboard` | Super-admin company list (authenticated) |
| `/api/employees.php` | Employee CRUD |
| `/api/supervisors.php` | Supervisor CRUD |
| `/api/time_entries.php` | Time entry read/write/delete |
| `/api/review_entries.php` | Approve / reject / clarify (supports `field` param for per-type approval) |
| `/api/export_payroll.php` | Export approved entries to Salaxy |
| `/api/payroll_settings.php` | Payroll period configuration |
| `/api/fetch_business_id.php` | Fetch business ID from Salaxy |
| `/api/sync_employees_from_salaxy.php` | Sync employees from Salaxy |
| `/api/update_language.php` | Update UI language per user |
| `/api/company_lang.php` | Get company default language |
| `/api/health.php` | Health check endpoint |

---

## Getting Started

### Prerequisites

- PHP 8.0+
- Node.js 20+ and npm
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- Salaxy API credentials (URL, username, password) — contact [Salaxy](https://salaxy.com) for API access

### Installation

1. Clone the repository and check out this branch:
   ```bash
   git clone https://github.com/jisosavi/TimeTrackingApp.git
   cd TimeTrackingApp
   git checkout vue-migration
   ```

2. Set credentials via environment variables or a local override file:

   **Option A — environment variables** (recommended for production / Railway):
   ```
   GEMINI_API_KEY=your-gemini-api-key
   JWT_SECRET=a-long-random-secret
   SALAXY_API_URL=https://api.salaxy.com/v03/api
   SALAXY_TOKEN_URL=https://api.salaxy.com/oauth2/token
   SALAXY_USERNAME=user@yourcompany.com
   SALAXY_PASSWORD=your-password
   ```

   **Option B — local override file** (for local dev):
   Copy `config.local.php.example` to `config.local.php` and fill in your values. This file is gitignored and loaded automatically by `config.php`.

3. Make sure the `data/` directory is writable. The SQLite database is created automatically on first run.

4. Install frontend dependencies and build:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   The production build is output to `frontend/dist/`. The `deploy-frontend.sh` script copies the built assets to the correct location for the Apache setup.

### Running locally

Start the PHP backend:
```bash
php -S localhost:8000
```

Start the Vite dev server (with API proxy to PHP):
```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api/` requests to `localhost:8000`, so both servers run together without CORS issues.

| URL | What it opens |
|---|---|
| `http://localhost:5173/{slug}` | Employee login (replace `{slug}` with your company slug) |
| `http://localhost:5173/{slug}/admin` | Company admin login |
| `http://localhost:5173/{slug}/approval` | Supervisor/manager login |
| `http://localhost:5173/admin` | Super-admin login |

A default super-admin (`superadmin@timeapp.local`) and a test company admin (`admin@timeapp.local`) are created on first run with default passwords defined in `bootstrap.php`. Change these before deploying to any shared environment.

### Frontend development commands

```bash
npm run dev          # Dev server with HMR
npm run build        # Type-check + production build
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests
npm run lint         # ESLint + Oxlint
```

### Adding a company

1. Log in to `/admin`
2. Click **+ New company** and fill in company name, slug, and admin credentials
3. Log in to `/{slug}/admin` and click **Sync employees from Salaxy** to import employees
4. Employees are created with a randomly generated PIN — reset individual PINs from the employee list as needed

---

## Project Structure

```
├── bootstrap.php                         # DB init, schema migrations, PIN hashing helper
├── config.php                            # Reads credentials from env vars; loads config.local.php if present
├── config.local.php.example             # Config template
├── deploy-frontend.sh                    # rsync dist/ to remote; derives path from VITE_APP_BASE automatically
├── nixpacks.toml / railway.toml         # Deployment configuration (Railway)
├── .env.production.example              # Template for VITE_API_BASE and VITE_APP_BASE
│
├── api/
│   ├── common.php                        # Shared JWT auth helpers and utilities
│   ├── cors.php                          # CORS headers for cross-origin dev setup
│   ├── jwt.php                           # JWT sign / verify
│   ├── admin_login.php                   # Company admin login → JWT
│   ├── companies.php                     # List companies / toggle active
│   ├── company_admins.php                # CRUD for company admin users
│   ├── company_lang.php                  # Get company default UI language
│   ├── create_company.php                # Create company + admin account
│   ├── employees.php                     # CRUD for employees
│   ├── supervisors.php                   # CRUD for supervisors
│   ├── pin_rate_limit.php                # PIN brute-force protection helpers (rate limit, cooldown, lock/unlock)
│   ├── supervisor_login.php              # Supervisor PIN login → JWT
│   ├── supervisor_team.php               # Supervisor ↔ employee assignments
│   ├── time_entries.php                  # Time entry read/write/delete
│   ├── review_entries.php                # Approve / reject / clarify (per-field support)
│   ├── clarify_entry.php                 # Employee clarification response (hours and km, independent)
│   ├── export_payroll.php                # Export approved entries to Salaxy payroll
│   ├── payroll_settings.php              # Payroll period settings per company
│   ├── fetch_business_id.php             # Fetch business ID from Salaxy
│   ├── sync_employees_from_salaxy.php    # Sync employees from Salaxy
│   ├── update_language.php               # Update UI language per user
│   ├── health.php                        # Health check
│   ├── logout.php
│   └── debug_credentials.php             # Dev/testing only — remove before publishing
│
├── locales/                              # Shared locale files (used by frontend)
│   ├── en.json                           # English
│   ├── fi.json                           # Finnish
│   ├── sv.json                           # Swedish
│   ├── et.json                           # Estonian
│   ├── uk.json                           # Ukrainian
│   └── xh.json                           # isiXhosa
│
├── frontend/                             # Vue 3 + TypeScript SPA
│   ├── index.html                        # Vite entry point
│   ├── vite.config.ts                    # Vite config (proxy, path aliases, Tailwind plugin)
│   ├── components.json                   # shadcn-vue component config
│   ├── src/
│   │   ├── main.ts                       # App bootstrap (Vue, Pinia, Router, i18n)
│   │   ├── App.vue                       # Root component; mounts useLocale()
│   │   ├── i18n.ts                       # createI18n — expands flat JSON keys at startup
│   │   ├── router/
│   │   │   └── index.ts                  # All routes + JWT auth navigation guards
│   │   ├── stores/
│   │   │   └── auth.ts                   # Pinia auth store (JWT payload, user, role)
│   │   ├── types/
│   │   │   └── index.ts                  # Shared TypeScript interfaces
│   │   ├── layouts/
│   │   │   └── AppLayout.vue             # Shell: header, nav tabs, language switcher
│   │   ├── views/
│   │   │   ├── LoginView.vue             # PIN login — kiosk keypad for employee/supervisor, email+password for admin
│   │   │   ├── EmployeeView.vue          # Employee: Log hours / My entries / Rejected tabs
│   │   │   ├── ManagerView.vue           # Supervisor/admin: Review / Approved / Rejected / Team tabs, bulk actions
│   │   │   ├── AdminView.vue             # Company admin: employees + supervisors management
│   │   │   ├── PayrollView.vue           # Export Payrolls to Salaxy: export section + payroll period overview
│   │   │   ├── PayrollSettingsView.vue   # Payroll period and payday configuration
│   │   │   └── SuperAdminView.vue        # Super-admin: company creation and management
│   │   ├── components/
│   │   │   ├── employee/
│   │   │   │   ├── ChatPanel.vue         # AI chat: message history, editable preview card before saving
│   │   │   │   ├── EntryList.vue         # Entry list (all entries or rejected-only mode via prop)
│   │   │   │   └── EntryCard.vue         # Single entry: status badge, type pills, rejection notes, clarify/delete
│   │   │   └── ui/
│   │   │       ├── EmptyState.vue        # Reusable empty state (icon slot, title, body, action link/callback)
│   │   │       └── …                     # shadcn-vue primitives (Badge, Button, Input, …)
│   │   └── composables/
│   │       ├── useApi.ts                 # Authenticated fetch wrapper (injects JWT header)
│   │       ├── useApproval.ts            # Approval state + reviewEntries (supports per-field)
│   │       ├── useAdminData.ts           # Employee/supervisor CRUD, sync, payroll export
│   │       ├── useChat.ts                # Gemini AI chat — send, preview state, confirm/cancel
│   │       ├── useTimeEntries.ts         # Employee entry list, rejected count, clarify (hours + km)
│   │       ├── useLocale.ts              # Watches auth.user.uiLanguage → sets global i18n locale
│   │       ├── useRefresh.ts             # Singleton refresh tick — cross-component data refresh signal
│   │       └── useSuperAdmin.ts          # Super-admin company management
│   └── dist/                             # Production build output (not in git)
│
├── screenshots/
└── data/
    └── app.sqlite                        # Auto-created SQLite DB, not in git
```

---

## License

Creative Commons Attribution-NonCommercial-NoDerivs (CC-BY-NC-ND)

https://creativecommons.org/licenses/by-nc-nd/4.0/deed.en
