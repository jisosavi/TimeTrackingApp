# TimeTrackingApp

TimeTrackingApp is a multi-company employee time tracking solution built on top of **[Salaxy](https://salaxy.com) payroll software and API**. It gives Salaxy users and software partners an easy, ready-to-deploy way to provide time tracking for the SME sector — without building payroll integration from scratch.

Employees log their hours using natural language (voice or text). An AI layer interprets the input, confirms the details in a conversational flow, and exports the final entry directly to Salaxy as a payslip item. Company admins manage employees and sync them from Salaxy. A top-level super-admin handles multiple companies from a single dashboard.

---

## Features

**Employee**
- PIN-based login at a company-specific URL (`/{slug}/`)
- Voice or text input — natural language like *"Yesterday 2h on project Alpha"*
- Gemini AI interprets entries, asks follow-up questions if details are missing, and shows a summary before sending
- Entries exported to Salaxy payroll via API — one payroll created per day, entries added as payslip items
- Mileage allowance (km-korvaus) support

**Company admin** (`/{slug}/admin/`)
- Manage employees: add, edit, deactivate, reset PIN
- Sync employees from Salaxy with one click — new employees are imported, existing ones updated
- Sync status shown inline: last synced timestamp, or error reason on failure
- Auto-sync on every admin login

**Super-admin** (`/admin/`)
- Create and manage companies with a slug-based URL and admin account
- Enable or disable time tracking per company via an inline toggle
- Navigate directly to each company's admin panel

---

## Screenshots

**Employee PIN login** — each company has its own login URL at `/{slug}/`.

<img src="screenshots/01-pin-login.png" width="260" alt="Employee PIN login">

---

**Time entry** — employees describe their hours in plain language. The AI confirms details and shows a summary before the entry is sent to Salaxy.

<img src="screenshots/02-time-entry.png" width="260" alt="Employee time entry chat UI">

---

**Company admin** — manage employees, reset PINs, and sync from Salaxy. Sync status and timestamp are shown inline next to the sync button.

<img src="screenshots/03-company-admin.png" width="600" alt="Company admin employee list">

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
├── validate_pin.php                # PIN authentication
├── save_hours.php                  # Export time entries to Salaxy
├── bootstrap.php                   # DB init and schema migrations
├── router.php                      # PHP dev server routing
├── config.php                      # API keys and DB path (not in git)
├── admin/
│   └── index.html                  # Super-admin UI
├── api/
│   ├── admin_login.php
│   ├── companies.php               # List companies / toggle active
│   ├── create_company.php          # Create company + admin account
│   ├── employees.php               # CRUD for employees
│   ├── sync_employees_from_salaxy.php
│   ├── logout.php
│   └── debug_credentials.php      # Dev/testing only — lists PINs
├── company/
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
