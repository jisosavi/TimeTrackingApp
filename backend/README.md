# TimeTrackingApp — Backend

Deno 2 + Hono API server. Handles auth, time entries, Salaxy payroll integration, and the Gemini AI proxy.

## Local development

### Prerequisites

- [Deno 2.x](https://deno.com)
- A PostgreSQL database (local or cloud — [Neon](https://neon.tech) free tier works well)

### Environment variables

Create a `.env` file in the repo root (or export these in your shell):

```
JWT_SECRET=a-long-random-secret
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgres://user:pass@host/dbname

# Salaxy API credentials (OAuth2 password grant)
SALAXY_API_URL=https://api.salaxy.com/v03/api
SALAXY_TOKEN_URL=https://api.salaxy.com/oauth2/token
SALAXY_USERNAME=user@yourcompany.com
SALAXY_PASSWORD=your-password

# Super-admin seed — used only on first boot; ignored after that
SA_EMAIL=superadmin@yourcompany.com
SA_PASSWORD=your-superadmin-password

# Optional
PORT=8080            # listening port (default: 8080)
```

### Start the dev server

Run from the repo root:

```bash
deno task dev
```

Starts Deno with `--watch` on port 8080. On first boot, pending SQL migrations in `backend/migrations/` are applied automatically.

The Vite dev server (frontend) proxies `/v01` to `http://localhost:8080` — both servers must be running for full local dev.

### Health check

```
GET http://localhost:8080/health
```

Returns `200 OK` when the server is up. Used by Railway as a liveness probe.

---

## Deploying to Railway

### One-time setup

1. Create a new Railway project and add two services: **GitHub repo** (Deno) and **PostgreSQL**.
   Both must be in the **same Railway project** so private networking works.
2. Railway detects `railway.toml` and uses the `Dockerfile` automatically.
3. In the Deno service's **Variables**, set:

   ```
   PG_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=...
   GEMINI_API_KEY=...
   SA_EMAIL=...
   SA_PASSWORD=...
   ```

   Using `PG_URL` (not `DATABASE_URL`) avoids a conflict with the internal `DATABASE_URL` that
   Railway auto-injects. The `${{Postgres.DATABASE_URL}}` reference resolves to the internal
   connection string (`postgres.railway.internal:5432`) automatically.

4. **Do not enable SSL** for internal connections — `db.ts` handles this automatically: SSL is
   disabled when the host ends in `.railway.internal`, and required otherwise.

> **External Postgres (Neon, Supabase, etc.):** set `PG_URL` to the external connection string
> directly. Standard port 5432 with SSL is reachable from Railway without restrictions.

### Redeploy

Push to the connected branch. Railway builds the Docker image and runs the backend. Migrations apply automatically at startup.

### Logs

Railway streams stdout/stderr. Startup errors and audit failures are logged there.

---

## Structure

```
backend/
├── main.ts              # Hono entry point — CORS, route registration, super-admin seed
├── migrations/          # Numbered .sql files applied at startup by lib/migrate.ts
├── lib/
│   ├── auth.ts          # requireEmployee / requireSupervisor / requireAdmin / requireSuperAdmin
│   ├── audit.ts         # writeAudit() helper
│   ├── config.ts        # All config read from env vars
│   ├── db.ts            # postgres.js sql client (single Postgres connection)
│   ├── migrate.ts       # Applies pending migrations from migrations/ at startup
│   ├── jwt.ts           # JWT sign/verify (HS256), hashPin (HMAC-SHA256)
│   ├── pin_rate_limit.ts
│   └── salaxy.ts        # Token cache (salaxy_tokens table), employee sync, payroll export
├── docs/
│   └── salaxy-03.json   # Salaxy OpenAPI spec — gitignored, re-fetch with:
│                        # curl -L https://code.salaxy.com/api-docs/salaxy-03.json -o backend/docs/salaxy-03.json
└── routes/              # One file per endpoint group
    └── super_admin_routes.ts  # Includes GET /api/super_admin/audit_log — paginated, filterable audit log read (super-admin only, testing use)
```
