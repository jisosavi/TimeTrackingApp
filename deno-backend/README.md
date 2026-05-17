# TimeTrackingApp — Backend

Deno 2 + Hono API server. Handles auth, time entries, Salaxy payroll integration, and the Gemini AI proxy.

## Local development

### Prerequisites

- [Deno 2.x](https://deno.com)
- `libsqlite3` installed on the system (on macOS: `brew install sqlite`)

### Environment variables

Create a `.env` file in the repo root (or export these in your shell):

```
JWT_SECRET=a-long-random-secret
GEMINI_API_KEY=your-gemini-api-key

# Salaxy API credentials (OAuth2 password grant)
SALAXY_API_URL=https://api.salaxy.com/v03/api
SALAXY_TOKEN_URL=https://api.salaxy.com/oauth2/token
SALAXY_USERNAME=user@yourcompany.com
SALAXY_PASSWORD=your-password

# Super-admin seed — used only on first boot; ignored after that
SA_EMAIL=superadmin@yourcompany.com
SA_PASSWORD=your-superadmin-password

# Optional overrides
DB_DIR=data          # directory for SQLite files (default: data/)
PORT=8080            # listening port (default: 8080)
```

### Start the dev server

Run from the repo root:

```bash
deno task dev
```

Starts Deno with `--watch` on port 8080. SQLite databases are created automatically under `data/` on first boot.

The Vite dev server (frontend) proxies `/v01` to `http://localhost:8080` — both servers must be running for full local dev.

**NOTE!**
Database and Deno Deploy compatibility: 
The backend uses SQLite via @db/sqlite, which requires FFI (Foreign Function Interface) to load the native SQLite C library into the Deno process. FFI is not available on Deno Deploy, which runs V8 isolates without native code access. The current setup is therefore not compatible with Deno Deploy and must be hosted on a platform that supports persistent disk and FFI — Railway with a mounted volume is the reference deployment target.
Migrating to a serverless-compatible database (e.g. Neon/Supabase Postgres via the HTTP driver) would unblock Deno Deploy.

### Health check

```
GET http://localhost:8080/health
```

Returns `200 OK` when the server is up. Used by Railway as a liveness probe.

---

## Deploying to Railway

### One-time setup

1. Create a new Railway service and connect the GitHub repo.
2. Railway detects `railway.toml` and uses the `Dockerfile` automatically — no additional build config needed.
3. Add a **Volume** to the service, mounted at `/app/data`. This is where SQLite databases live; without a persistent volume they are lost on every redeploy.

### Environment variables (Railway dashboard)

Set the same variables as the local `.env` above. `JWT_SECRET` must be consistent across deploys — changing it invalidates all active sessions.

### Redeploy

Push to the connected branch. Railway builds the Docker image and runs:

```
deno run --allow-net --allow-read --allow-write --allow-env --allow-ffi deno-backend/main.ts
```

The `--allow-ffi` flag is required for SQLite. The `DENO_SQLITE_PATH` env var in the Dockerfile points to the system `libsqlite3` to avoid a runtime download on every start.

### Logs

Railway streams stdout/stderr. Startup errors and audit failures are logged there. The `writeAudit()` function also writes a `system.audit_failure` row to `master.sqlite` if a business-logic audit write fails — check Railway logs first, then the master DB if you need to investigate gaps.

---

## Structure

```
deno-backend/
├── main.ts              # Hono entry point — CORS, route registration, super-admin seed
├── bootstrap.ts         # SQLite schema init and inline migrations
├── lib/
│   ├── auth.ts          # requireEmployee / requireSupervisor / requireAdmin / requireSuperAdmin
│   ├── audit.ts         # writeAudit() helper
│   ├── config.ts        # All config read from env vars
│   ├── db.ts            # getMasterDb / getCompanyDb / getCompanyDbBySlug
│   ├── jwt.ts           # JWT sign/verify (HS256), hashPin (HMAC-SHA256)
│   ├── pin_rate_limit.ts
│   └── salaxy.ts        # Token cache, employee sync, payroll export
└── routes/              # One file per endpoint group
```
