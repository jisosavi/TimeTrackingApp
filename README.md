# TimeTrackingApp

An easy to use, AI-powered time tracking solution seamlessly integrated with **[Salaxy](https://salaxy.com)**. Salaxy is the real-time, open API payroll platform.

Focus is on usability: easy for employees to log hours and easy for managers to approve!

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
- **Automatic Employee Sync**: Employees are synchronized from Salaxy's payroll system with one click
- **Company-Level Administration**: Each company admin has full control over their workforce

### Multi-Language Support
- UI languages can be added easily — one JSON file per locale, no code changes required
- This package has ENG, FIN, SWE, EST, UKR, isiXhosa locales
- Language is set independently per company, per employee, and per supervisor

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
- **Mark holidays on entries**: Approvals tab has a country selector (default Finland) and a **Mark holidays on entries** button — fetches public holidays for the current year from Nager.Date and appends the holiday name to the comment field of all `pending` and `approved` entries on matching dates

**Super-admin** (`/admin/`)
- Login via **Salaxy OAuth2** — clicking "Sign in with Salaxy" redirects to Salaxy's authorization page; on return the account is matched against the super-admins table and a JWT is issued
- Create and manage companies with a slug-based URL, admin account, and Salaxy Account ID
- Enable or disable **Time App** and **Approvals** per company via toggle cards; disabling requires a confirmation dialog and preserves all existing data
- Manage admins of each company
- Navigate directly to each company's admin panel

---

## Screenshots

**Simple PIN login** — each company has its own login URL at `/{slug}/`.
Employees and managers/supervisors only need to open the URL on any device and give their unique PIN.
Nothing else is needed for onboarding, no configuration or installing anything!

<img src="screenshots/01-pin-login.png" width="260" alt="Employee PIN login">

---

**Time entry** — employees describe their hours in plain language. The AI confirms details and shows a summary before the entry is sent to manager for approval.

<img src="screenshots/02-time-entry.png" width="260" alt="Employee time entry chat UI">

Employees can see the entries they have made and follow the approval process. They can also comment if managers have questions about the entries.

---

**Company admin** — manage employees, reset PINs, and sync from Salaxy. Sync status and timestamp are shown inline next to the sync button.

<img src="screenshots/03-company-admin.png" width="260" alt="Company admin employee list">

---

**Approvals** — supervisors/managers can follow the entries sent by their employees and approve them. They can also ask for more information about the entries.
Managers only need to open the URL on any device and give their unique PIN.
Nothing else is needed for onboarding, no configuration or installing anything!

<img src="screenshots/05-approval.png" width="260" alt="Approval view">

---

**Super-admin** — all companies in one table. Toggle time tracking and approvals on/off per company without leaving the page.

<img src="screenshots/04-super-admin.png" width="260" alt="Super-admin company list">

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript, Vite 8, Composition API (`<script setup>`) |
| UI components | shadcn-vue (Reka UI primitives), Tailwind CSS v4 |
| State management | Pinia |
| Routing | Vue Router 5 (history mode, JWT-guarded navigation guards) |
| i18n | vue-i18n v11 (`legacy: false`), flat JSON locale files in `locales/` |
| Backend | Deno 2 + Hono framework |
| Database | SQLite via `@db/sqlite` — one master DB + one DB per company |
| Auth | JWT (HS256), HMAC-SHA256 PIN hashing |
| AI | Google Gemini API (natural language → structured time entry) |
| Payroll | Salaxy REST API — OAuth2 token auth, employee sync, payroll export |
| Dev server | Vite (frontend) + Deno with `--watch` (backend) |
| Production | Railway (Deno via Dockerfile) + Apache with `.htaccess` rewrites (frontend) |
| Testing | Vitest (unit), Playwright (e2e), vue-tsc (type-check) |

> **Database and Deno Deploy compatibility**
> The backend uses SQLite via `@db/sqlite`, which requires FFI (Foreign Function Interface) to load the native SQLite C library into the Deno process. FFI is not available on Deno Deploy, which runs V8 isolates without native code access. The current setup is therefore **not compatible with Deno Deploy** and must be hosted on a platform that supports persistent disk and FFI — Railway with a mounted volume is the reference deployment target. Migrating to a serverless-compatible database (e.g. Neon/Supabase Postgres via the HTTP driver) would unblock Deno Deploy.

### Supported languages

| Code | Language |
|---|---|
| `en` | English |
| `fi` | Suomi |
| `sv` | Svenska |
| `et` | Eesti |
| `uk` | Українська |
| `xh` | isiXhosa |

Adding a new locale requires only a new JSON file in `locales/` — no code changes needed.

---

## URL Structure

| Path | Description |
|---|---|
| `/{slug}` | Employee PIN login |
| `/{slug}/home` | Employee time entry (authenticated) |
| `/{slug}/approval` | Supervisor/manager PIN login |
| `/{slug}/approval/home` | Supervisor approval portal (authenticated) |
| `/{slug}/admin` | Company admin login |
| `/{slug}/admin/dashboard` | Personnel management (authenticated) |
| `/{slug}/admin/payroll-summary` | Export Payrolls to Salaxy — default admin landing |
| `/{slug}/admin/payroll-settings` | Payroll period settings |
| `/admin` | Super-admin login (Salaxy OAuth2) |
| `/admin/dashboard` | Super-admin company list |

---

## Getting Started

### Prerequisites

- [Deno 2.x](https://deno.com)
- Node.js 20+ and npm
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- Salaxy API credentials (URL, username, password) — contact [Salaxy](https://salaxy.com) for API access

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jisosavi/TimeTrackingApp.git
   cd TimeTrackingApp
   ```

2. Set environment variables (Railway dashboard for production, `.env` file or shell for local dev):
   ```
   JWT_SECRET=a-long-random-secret
   GEMINI_API_KEY=your-gemini-api-key

   # Salaxy API credentials — used for employee sync and payroll export (OAuth2 password grant)
   SALAXY_API_URL=https://api.salaxy.com/v03/api
   SALAXY_TOKEN_URL=https://api.salaxy.com/oauth2/token
   SALAXY_USERNAME=user@yourcompany.com
   SALAXY_PASSWORD=your-password

   # Super-admin seed — only used on first boot to create the initial super-admin account.
   # After the first boot these are ignored; the super-admin record lives in the database.
   # Super-admin login uses Salaxy OAuth ("Sign in with Salaxy"), so SA_EMAIL/SA_PASSWORD
   # serve as a fallback only — e.g. if Salaxy OAuth is unavailable.
   SA_EMAIL=superadmin@yourcompany.com
   SA_PASSWORD=your-superadmin-password
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend && npm install
   ```

### Running locally

Start the Deno backend:
```bash
deno task dev
```

Start the Vite dev server (with API proxy to Deno):
```bash
cd frontend
npm run dev
```

| URL | What it opens |
|---|---|
| `http://localhost:5173/{slug}` | Employee login |
| `http://localhost:5173/{slug}/admin` | Company admin login |
| `http://localhost:5173/{slug}/approval` | Supervisor/manager login |
| `http://localhost:5173/admin` | Super-admin login |

On first boot, if `SA_EMAIL` and `SA_PASSWORD` are set and no super-admin exists, one is seeded automatically.

### Frontend development commands

```bash
npm run dev          # Dev server with HMR
npm run build        # Type-check + production build
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests
npm run lint         # ESLint + Oxlint
```

### Deploying

**Backend** — push to a Railway service configured with the `Dockerfile`. Mount a persistent volume at `/app/data` for the SQLite databases. Set all environment variables in the Railway dashboard.

**Frontend** — build with `VITE_API_BASE` pointing to the Railway service URL and `VITE_APP_BASE` set to the sub-path on your Apache server, then rsync `frontend/dist/` to the server:
```bash
./deploy-frontend.sh
```

### Adding a company

1. Log in to `/admin` as super-admin
2. Click **+ New Company** and fill in company name, slug, admin credentials, and Salaxy Account ID
3. Log in to `/{slug}/admin` and click **Sync employees from Salaxy** to import employees
4. Employees are created with a randomly generated PIN — reset individual PINs from the employee list as needed

---

## Project Structure

```
├── Dockerfile                            # Deno production container
├── deno.json                             # Deno tasks and import map
├── railway.toml                          # Railway deployment config
├── deploy-frontend.sh                    # rsync dist/ to remote Apache server
├── deploy-deno-demo.sh                   # Deploy frontend pointed at a specific Deno URL/path
│
├── deno-backend/
│   ├── main.ts                           # Hono app entry point; CORS, route registration, super-admin seed
│   ├── bootstrap.ts                      # SQLite schema init and inline migrations
│   ├── lib/
│   │   ├── auth.ts                       # requireEmployee / requireSupervisor / requireAdmin / requireSuperAdmin middleware
│   │   ├── config.ts                     # All config read from env vars
│   │   ├── db.ts                         # getMasterDb / getCompanyDb / getCompanyDbBySlug
│   │   ├── jwt.ts                        # JWT sign/verify (HS256), hashPin (HMAC-SHA256)
│   │   ├── pin_rate_limit.ts             # PIN brute-force protection helpers
│   │   └── salaxy.ts                     # Salaxy API: token cache, employee sync, payroll export
│   ├── routes/                           # One file per endpoint group
│   │   ├── health.ts                     # GET /health
│   │   ├── validate_pin.ts               # POST /v01/api/validate_pin
│   │   ├── supervisor_login.ts           # POST /v01/api/supervisor_login
│   │   ├── admin_login.ts                # POST /v01/api/admin_login (company admin + super-admin)
│   │   ├── salaxy_oauth_callback.ts      # GET /v01/api/salaxy_oauth_callback
│   │   ├── employees.ts                  # GET/POST/PATCH /v01/api/employees
│   │   ├── supervisors.ts                # GET/POST/PATCH /v01/api/supervisors
│   │   ├── company_admins.ts             # GET/POST/PATCH /v01/api/company_admins
│   │   ├── time_entries.ts               # GET/POST/DELETE /v01/api/time_entries
│   │   ├── review_entries.ts             # POST /v01/api/review_entries
│   │   ├── clarify_entry.ts              # POST /v01/api/clarify_entry
│   │   ├── companies.ts                  # GET/POST /v01/api/companies
│   │   ├── payroll_settings.ts           # GET/POST /v01/api/payroll_settings
│   │   ├── export_payroll.ts             # GET/POST /v01/api/export_payroll
│   │   ├── sync_employees.ts             # POST /v01/api/sync_employees_from_salaxy
│   │   ├── fetch_business_id.ts          # GET /v01/api/fetch_business_id
│   │   ├── admin_routes.ts               # GET/PATCH /v01/api/admin/country_setting, POST /v01/api/admin/mark_holidays
│   │   ├── super_admin_routes.ts         # DELETE/POST/PATCH /v01/api/super_admin/*
│   │   ├── my_team.ts                    # GET /v01/api/my_team
│   │   ├── supervisor_team.ts            # GET/POST /v01/api/supervisor_team
│   │   ├── company_lang.ts               # GET /v01/api/company_lang
│   │   ├── update_language.ts            # POST /v01/api/update_language
│   │   ├── logout.ts                     # ALL /v01/api/logout
│   │   └── llm_proxy.ts                  # POST /v01/api/llm_proxy (Gemini API proxy)
│   └── scripts/
│       └── seed_superadmin.ts            # One-time seed script (alternative to env-var auto-seed)
│
├── locales/                              # Shared locale files (used by frontend)
│   ├── en.json, fi.json, sv.json, et.json, uk.json, xh.json
│
├── frontend/                             # Vue 3 + TypeScript SPA
│   ├── vite.config.ts                    # Vite config: proxy, base path, .htaccess generation
│   ├── src/
│   │   ├── router/index.ts               # All routes + JWT navigation guards
│   │   ├── stores/auth.ts                # Pinia auth store
│   │   ├── views/
│   │   │   ├── LoginView.vue             # PIN keypad (employee/supervisor) + email/password (admin)
│   │   │   ├── EmployeeView.vue          # Log / Entries / Rejected tabs
│   │   │   ├── ManagerView.vue           # Review / Approved / Rejected / Team tabs
│   │   │   ├── AdminView.vue             # Personnel + Approvals management
│   │   │   ├── PayrollView.vue           # Payroll export
│   │   │   ├── PayrollSettingsView.vue   # Payroll period config
│   │   │   └── SuperAdminView.vue        # Company management
│   │   ├── components/
│   │   │   ├── employee/                 # ChatPanel, EntryList, EntryCard
│   │   │   ├── super-admin/              # CompanySettingsDrawer, FeatureToggleCard
│   │   │   └── ui/                       # shadcn-vue primitives
│   │   └── composables/
│   │       ├── useApi.ts, useApproval.ts, useAdminData.ts
│   │       ├── useChat.ts, useTimeEntries.ts, useSuperAdmin.ts
│   │       ├── useLocale.ts, useRefresh.ts, useHolidays.ts
│
└── data/                                 # SQLite databases (auto-created, not in git)
    ├── master.sqlite                     # Company registry + super-admin accounts
    └── companies/{id}.sqlite             # One file per company
```

---

## Audit Trail

Every meaningful action in the system — authentication, time entry changes, personnel management, and payroll exports — is recorded in an append-only `audit_log` table. Records are never updated or deleted.

### What is recorded

| Category | Events |
|---|---|
| Authentication | `auth.pin.success`, `auth.pin.failure`, `auth.login.success`, `auth.login.failure` |
| Time entries | `time_entry.created`, `time_entry.approved`, `time_entry.rejected`, `time_entry.deleted`, `time_entry.clarified`, `time_entry.km_clarified` |
| Personnel | `employee.created`, `employee.updated`, `employee.pin_unlocked`, `supervisor.created`, `supervisor.updated`, `supervisor.deleted`, `supervisor.pin_unlocked` |
| Payroll | `payroll.exported` |
| System | `system.audit_failure` (see failure handling below) |

Each record carries: timestamp (UTC), event name, actor type and ID, client IP (from `x-forwarded-for`), resource type and ID, before/after state snapshots for mutations, outcome (`ok` / `error`), and a free-form metadata field.

### Storage layout

Audit records follow the same two-database split as the rest of the application data:

```
┌─────────────────────────────────────────────────────────────┐
│                      Incoming Request                       │
│                                                             │
│  Employee  ──── validate_pin.ts         ───┐                │
│  Supervisor ─── supervisor_login.ts     ───┤                │
│  Admin ──────── admin_login.ts          ───┤                │
│              ── employees.ts            ───┤  Hono route    │
│              ── supervisors.ts          ───┤  handler       │
│              ── time_entries.ts         ───┤                │
│              ── review_entries.ts       ───┤                │
│              ── clarify_entry.ts        ───┤                │
│              ── export_payroll.ts       ───┤                │
│  Super-admin ── admin_login.ts (no slug)───┘                │
└─────────────────────────────────────────────────────────────┘
                          │
                          │  1. Business logic + DB write
                          │  2. writeAudit() called
                          ▼
               ┌──────────────────────┐
               │   lib/audit.ts       │
               │   writeAudit(        │
               │     companyId,       │
               │     event            │
               │   )                  │
               └──────────┬───────────┘
                          │
           ┌──────────────┴────────────────┐
           │ companyId > 0                 │ companyId = 0
           ▼                               ▼
┌─────────────────────┐       ┌────────────────────────────┐
│ data/companies/     │       │ data/master.sqlite         │
│ {id}.sqlite         │       │                            │
│ ┌─────────────────┐ │       │ ┌────────────────────────┐ │
│ │   audit_log     │ │       │ │       audit_log        │ │
│ │                 │ │       │ │                        │ │
│ │ time entries    │ │       │ │ superadmin login       │ │
│ │ auth events     │ │       │ │ company management     │ │
│ │ employee CRUD   │ │       │ │ system.audit_failure   │ │
│ │ payroll exports │ │       │ └────────────────────────┘ │
│ └─────────────────┘ │       └────────────────────────────┘
└─────────────────────┘
```

### Failure handling

Audit writes are not allowed to block business operations. If a write to the target database fails, the system degrades gracefully:

```
  writeAudit() called
        │
        ▼
  try: INSERT into target DB ──── ok ──► done
        │
        │ fail
        ▼
  console.error (captured by Railway log drain)
        │
        ▼
  try: INSERT system.audit_failure → master.sqlite
       { originalEvent, companyId, error message }
        │
        │  ◄── gap is now detectable even if primary write failed
        ▼
  business operation completes normally (HTTP response sent)
```

This means:
- A broken audit table never prevents employees from logging hours or admins from exporting payroll.
- Any failure produces a `system.audit_failure` row in the master DB, creating a detectable gap — you know *that* a record was missed and approximately when.
- If even the master DB is unavailable, the `console.error` remains in Railway's log drain as a last resort.

### Compliance alignment

| Standard | Requirement | How it is met |
|---|---|---|
| NIST SP 800-53 AU-3 | Who, what, when, where, outcome | All five fields on every record |
| NIST AU-9 | Logs protected from modification | No route exposes UPDATE/DELETE on `audit_log` |
| NIST AU-11 | Retention policy | Records kept indefinitely (append-only) |
| ISO 27001 A.12.4.1 | Log user activities and exceptions | Auth, mutation, and export events all captured |
| ISO 27001 A.12.4.4 | Clock synchronisation | Deno uses system NTP; timestamps stored as UTC ISO 8601 |
| ITIL Change Management | Before/after state for changes | `before_json` / `after_json` on all mutation events |

---

## License

Creative Commons Attribution-NonCommercial-NoDerivs (CC-BY-NC-ND)

https://creativecommons.org/licenses/by-nc-nd/4.0/deed.en
