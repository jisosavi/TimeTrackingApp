# TimeTrackingApp

An easy to use, AI-powered time tracking solution seamlessly integrated with **[Salaxy](https://salaxy.com)** - the real-time, open API payroll platform trusted by forward-thinking businesses.

Focus is on usability: easy for employees to log hours and easy for manager to approve!

## Overview

TimeTrackingApp extends Salaxy's automated payroll capabilities by providing an intuitive time and expense tracking interface for small and medium enterprises. Built on Salaxy's powerful Open API, it demonstrates how developers can create value-added solutions that integrate directly with real-time payroll processing.

## Key Features

### Very Easy Login and Time Entry
- **Login with PIN**: Employees login with PIN. Works with simple URL on any phone. Nothing else needed!
- **Voice & Text Input**: Employees log hours using conversational AI (text or speech)
- **Smart Interpretation**: AI understands natural language entries like "worked 8 hours on client project today"
- **Confirmation Flow**: Interactive dialogue ensures accuracy before submission

### Streamlined Approval Workflow
- **Very Easy to Use for Manager**: Manager login with PIN. Works with simple URL on any phone!
- **Manager Review**: Company managers can approve, reject, or request clarification on entries
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

## Why Build on Salaxy?

This project showcases the power of Salaxy's modern payroll infrastructure:

- **Open API First**: RESTful, OpenAPI-compliant endpoints make integration straightforward
- **Real-Time Processing**: No batch delays - see changes instantly
- **AI Integrated**: AI helps payroll users and platform is built for the future with Salaxy AI architecture
- **Developer-Friendly**: Comprehensive documentation, test environments, and consistent APIs
- **Break Free from Legacy**: Unlike closed-box solutions, Salaxy empowers developers to innovate

---

## Features

**Employee**
- PIN-based login at a company-specific URL (`/{slug}/`)
- Voice or text input — natural language like *"Yesterday 2h on project Alpha"*
- Gemini AI interprets entries, asks follow-up questions if details are missing, and shows a summary before sending
- Entries exported to Salaxy payroll via API — one payroll created per day, entries added as payslip items
- Mileage allowance (km-korvaus) support, easy to add more entry types

**Company managers** (`/{slug}/approval/`)
- Manage approval of entries: approve/reject/ask clarification.

**Company admin** (`/{slug}/admin/`)
- Manage employees: add, edit, deactivate, reset PIN
- Manage teams and managers: who works in what team and who are the managers in approval
- Sync employees from Salaxy with one click — new employees are imported, existing ones updated
- Sync status shown inline: last synced timestamp, or error reason on failure
- Auto-sync on every admin login

**Super-admin** (`/admin/`)
- Create and manage companies with a slug-based URL and admin account
- Enable or disable time tracking per company via an inline toggle
- Manage admins of each company
- Navigate directly to each company's admin panel

---

## Screenshots

**Employee PIN login** — each company has its own login URL at `/{slug}/`.
Employees only need to open URL on any device and give their unique PIN.
Nothing else is needed for onboarding, no configuration or installing anything!

<img src="screenshots/01-pin-login.png" width="260" alt="Employee PIN login">

---

**Time entry** — employees describe their hours in plain language. The AI confirms details and shows a summary before the entry is sent to manager for approval.

<img src="screenshots/02-time-entry.png" width="260" alt="Employee time entry chat UI">

Employees can see the entries they have made and follow the approval process. They can also comment if managers have questions about the entries.

<img src="screenshots/02-time-entry-2.png" width="260" alt="Employee time entry chat UI">

---

**Company admin** — manage employees, reset PINs, and sync from Salaxy. Sync status and timestamp are shown inline next to the sync button.

<img src="screenshots/03-company-admin.png" width="600" alt="Company admin employee list">

---

**Approvals** — managers can follow the entries sent by their employees and approve them. They can also ask for more information about the entries.
Managers only need to open URL on any device and give their unique PIN.
Nothing else is needed for onboarding, no configuration or installing anything!

<img src="screenshots/05-approval.png" width="600" alt="Company admin employee list">

---

**Super-admin** — all companies in one table. The first column toggles time tracking on/off per company without leaving the page.

<img src="screenshots/04-super-admin.png" width="600" alt="Super-admin company list">

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML/CSS — Figtree font, Salaxy design tokens |
| Backend | PHP 8+, SQLite via PDO |
| AI | Google Gemini API (natural language → structured time entry) |
| Payroll | Salaxy REST API — OAuth2 token auth, employee sync, payroll export |
| Dev server | PHP built-in server with `router.php` for slug-based routing |
| Production | Apache with `.htaccess` rewrites |

---

## URL Structure

| Path | Description |
|---|---|
| `/{slug}/` | Employee PIN login and time entry |
| `/{slug}/approval/` | Supervisor/manager approval portal |
| `/{slug}/admin/` | Company admin dashboard |
| `/admin/` | Super-admin: all companies |

---

## Getting Started

### Prerequisites

- PHP 8.0+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- Salaxy API credentials (URL, username, password) — contact [Salaxy](https://salaxy.com) for API access

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jisosavi/TimeTrackingApp.git
   cd TimeTrackingApp
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

3. Make sure the `data/` directory is writable. The SQLite database is created automatically on first run.

### Running locally

```bash
php -S localhost:8000 router.php
```

| URL | What it opens |
|---|---|
| `http://localhost:8000/test-company/` | Employee login (test company) |
| `http://localhost:8000/test-company/admin/` | Company admin |
| `http://localhost:8000/admin/` | Super-admin |

A default super-admin and test company are bootstrapped on first run:

| Role | Email | Password |
|---|---|---|
| Super-admin / Company admin | `admin@timeapp.local` | `Admin123!` |

> **Change the default password before deploying to any shared environment.**

### Adding a company

1. Log in to `/admin/`
2. Click **+ Uusi yritys** and fill in company name, slug, and admin credentials
3. Log in to `/{slug}/admin/` and click **Synkronoi työntekijät Salaxystä** to import employees

---

## Project Structure

```
├── index.html                      # Employee login + time entry UI
├── approval.html                   # Supervisor/manager approval portal
├── validate_pin.php                # Employee PIN authentication
├── save_hours.php                  # Time entry submission (legacy)
├── salaxy_sync.php                 # Salaxy API integration helpers
├── llm_proxy.php                   # Gemini AI proxy
├── bootstrap.php                   # DB init and schema migrations
├── router.php                      # PHP dev server routing
├── config.php                      # API keys and DB path (not in git)
├── admin/
│   └── index.html                  # Super-admin UI
├── api/
│   ├── common.php                  # Shared auth helpers and utilities
│   ├── admin_login.php             # Company admin login
│   ├── companies.php               # List companies / toggle active
│   ├── company_admins.php          # CRUD for company admin users
│   ├── create_company.php          # Create company + admin account
│   ├── employees.php               # CRUD for employees
│   ├── supervisors.php             # CRUD for supervisors
│   ├── supervisor_login.php        # Supervisor PIN login
│   ├── supervisor_team.php         # Supervisor ↔ employee assignments
│   ├── time_entries.php            # Time entry read/delete
│   ├── review_entries.php          # Approve / reject / clarify entries
│   ├── clarify_entry.php           # Employee clarification response
│   ├── export_payroll.php          # Export approved entries to Salaxy payroll
│   ├── payroll_settings.php        # Payroll period settings per company
│   ├── sync_employees_from_salaxy.php
│   ├── logout.php
│   └── debug_credentials.php      # Dev/testing only — lists PINs
├── company/
│   ├── index.php                   # Router for company-scoped paths
│   └── {slug}/
│       └── admin/
│           ├── index.html
│           └── admin.js
└── data/
    └── app.sqlite                  # Auto-created, not in git
```

---

## License

MIT
