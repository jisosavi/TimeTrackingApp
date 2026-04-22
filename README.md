# TimeTrackingApp

An easy to use, AI-powered time tracking solution seamlessly integrated with **[Salaxy](https://salaxy.com)**. Salaxy is the real-time, open API payroll platform.

Focus is on usability: easy for employees to log hours and easy for managers to approve!

> **Branch: `vue-migration`** — This branch replaces the original Vanilla JS frontend with a Vue 3 + TypeScript single-page application. The PHP backend and Salaxy integration are unchanged.

## Overview

TimeTrackingApp extends Salaxy's automated payroll capabilities by providing an intuitive time and expense tracking interface for small and medium enterprises. 
Built on Salaxy's powerful Open API, it demonstrates how developers can create value-added solutions that integrate directly with real-time payroll processing.
Support for multiple UI languages, easy to add more locales when needed.

## Key Features

### Very Easy Login and Time Entry
- **Login with PIN**: Employees login with PIN. Works with simple URL on any phone. Nothing else needed!
- **Voice & Text Input**: Employees log hours using conversational AI (text or speech)
- **Smart Interpretation**: AI understands natural language entries like "worked 8 hours on client project today"
- **Confirmation Flow**: Interactive dialogue ensures accuracy before submission

### Streamlined Approval Workflow
- **Very Easy to Use for Supervisors/Managers**: Manager login with PIN. Works with simple URL on any phone!
- **Manager Review**: Company managers can approve, reject, or request clarification on entries
- **Independent Hours/Mileage Approval**: Entries with both hours and km can be approved or rejected independently
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
- PIN-based login at a company-specific URL
- Voice or text input — natural language like *"Yesterday 2h on project Alpha"*
- Gemini AI interprets entries, asks follow-up questions if details are missing, and shows a summary before sending
- Entries exported to Salaxy payroll via API — one payroll created per day, entries added as payslip items
- Mileage allowance (km-korvaus) support with per-type approval tracking
- Type pills on each entry row identify hours vs. kilometre entries at a glance

**Company supervisor** (`/{slug}/approval/`)
- Manage approval of entries: approve / reject / ask clarification
- Hours and kilometres on the same entry appear as separate approval cards — each can be approved or rejected independently
- Rejected entries carry a per-type rejection note visible to the employee

**Company admin** (`/{slug}/admin/`)
- Manage employees: add, edit, deactivate, reset PIN, set UI language per employee
- Manage teams and supervisors: who works in what team and who approves what
- Sync employees from Salaxy with one click — new employees are imported, existing ones updated
- Payroll export: preview approved entries per period and push to Salaxy with one click
- Configurable payroll period (monthly or fortnightly) with flexible payday settings

**Super-admin** (`/admin/`)
- Create and manage companies with a slug-based URL and admin account
- Enable or disable time tracking per company via an inline toggle
- Manage admins of each company
- Navigate directly to each company's admin panel

---

## Screenshots (OLD!)

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
| `/{slug}/admin/dashboard` | Company admin dashboard (authenticated) |
| `/{slug}/admin/payroll` | Payroll export (authenticated) |
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

2. Configure `config.php` with your credentials:
   ```php
   define('GEMINI_API_KEY',  'your-gemini-api-key');
   define('SALAXY_API_URL',  'https://api.salaxy.com/v03/api');
   define('SALAXY_TOKEN_URL','https://api.salaxy.com/oauth2/token');
   define('SALAXY_USERNAME', 'user@yourcompany.com');
   define('SALAXY_PASSWORD', 'your-password');
   define('DB_FILE', __DIR__ . '/data/app.sqlite');
   ```
   A `config.local.php.example` file is included as a template.

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
php -S localhost:8000 router.php
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

A default super-admin and test company are bootstrapped on first run. Login credentials are set in `bootstrap.php` — change the default password before deploying to any shared environment.

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
├── bootstrap.php                         # DB init and schema migrations
├── router.php                            # PHP dev server routing
├── config.php                            # API keys and DB path (not in git)
├── config.local.php.example             # Config template
├── deploy-frontend.sh                    # Copies dist/ to Apache web root
├── nixpacks.toml / railway.toml         # Deployment configuration
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
│   ├── supervisor_login.php              # Supervisor PIN login → JWT
│   ├── supervisor_team.php               # Supervisor ↔ employee assignments
│   ├── time_entries.php                  # Time entry read/write/delete
│   ├── review_entries.php                # Approve / reject / clarify (per-field support)
│   ├── clarify_entry.php                 # Employee clarification response
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
│   │   │   ├── LoginView.vue             # PIN login (all roles, detected from route meta)
│   │   │   ├── EmployeeView.vue          # Employee: AI chat + entry list tabs
│   │   │   ├── ManagerView.vue           # Supervisor/admin: approval tabs (VirtualCard pattern)
│   │   │   ├── AdminView.vue             # Company admin: employees + supervisors management
│   │   │   ├── PayrollView.vue           # Payroll export preview and Salaxy push
│   │   │   ├── PayrollSettingsView.vue   # Payroll period and payday configuration
│   │   │   └── SuperAdminView.vue        # Super-admin: company creation and management
│   │   ├── components/
│   │   │   ├── employee/
│   │   │   │   ├── ChatPanel.vue         # Gemini AI chat input and message history
│   │   │   │   ├── EntryList.vue         # Submitted time entry list with refresh
│   │   │   │   └── EntryCard.vue         # Single entry: status badge, type pills, clarify/delete
│   │   │   └── ui/                       # shadcn-vue primitives (Badge, Button, Input, …)
│   │   └── composables/
│   │       ├── useApi.ts                 # Authenticated fetch wrapper (injects JWT header)
│   │       ├── useApproval.ts            # Approval state + reviewEntries (supports per-field)
│   │       ├── useAdminData.ts           # Employee/supervisor CRUD, sync, payroll export
│   │       ├── useChat.ts                # Gemini AI chat session state
│   │       ├── useTimeEntries.ts         # Employee entry list state and actions
│   │       ├── useLocale.ts              # Watches auth.user.uiLanguage → sets global i18n locale
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
