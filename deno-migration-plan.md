# PHP → Deno/Hono Migration Plan

## Stack

| Need | Package |
|---|---|
| HTTP framework | `jsr:@hono/hono` |
| CORS | `jsr:@hono/hono/cors` |
| SQLite | `jsr:@db/sqlite` |
| JWT | Web Crypto API (built-in, no library) |
| HTTP client (Salaxy) | `fetch` (built-in) |

## Branch strategy

```
main      ← PHP, production, stays untouched until cutover
└── deno-dev  ← all Deno work, merges to main when complete
```

Railway: separate service pointing at `deno-dev` branch with same Volume (`/app/data`) for testing.

---

## Project structure

```
deno-backend/
├── deno.json                      # Import map + dev/start tasks
├── main.ts                        # Entry point: Hono app, all routes registered
├── bootstrap.ts                   # DB schema init + inline migrations (≈ bootstrap.php)
├── lib/
│   ├── config.ts                  # Reads env vars (JWT_SECRET, GEMINI_API_KEY, …)
│   ├── db.ts                      # getMasterDb(), getCompanyDb(), getCompanyDbBySlug()
│   ├── jwt.ts                     # generateToken(), verifyToken() — matches PHP HS256 exactly
│   ├── auth.ts                    # Hono middleware: requireEmployee, requireAdmin, etc.
│   ├── pin_rate_limit.ts          # Rate-limit helpers
│   └── salaxy/
│       ├── token.ts               # getSalaxyToken() with file-based 23h cache
│       └── api.ts                 # Generic Salaxy fetch helper
└── routes/
    ├── health.ts
    ├── validate_pin.ts
    ├── admin_login.ts
    ├── salaxy_oauth_callback.ts
    ├── employees.ts
    ├── supervisors.ts
    ├── time_entries.ts
    ├── review_entries.ts
    ├── clarify_entry.ts
    ├── companies.ts
    ├── company_admins.ts
    ├── create_company.ts
    ├── update_language.ts
    ├── company_lang.ts
    ├── my_team.ts
    ├── supervisor_team.ts
    ├── payroll_settings.ts
    ├── export_payroll.ts
    ├── sync_employees_from_salaxy.ts
    ├── fetch_business_id.ts
    ├── logout.ts
    └── super_admin/
        ├── update_company.ts
        ├── set_feature.ts
        └── delete_company.ts
```

---

## deno.json

```json
{
  "tasks": {
    "dev":   "deno run --watch --allow-net --allow-read --allow-write --allow-env deno-backend/main.ts",
    "start": "deno run --allow-net --allow-read --allow-write --allow-env deno-backend/main.ts"
  },
  "imports": {
    "@hono/hono": "jsr:@hono/hono",
    "@hono/cors": "jsr:@hono/hono/cors",
    "@db/sqlite": "jsr:@db/sqlite"
  }
}
```

---

## JWT compatibility note

PHP produces header `{"typ":"JWT","alg":"HS256"}` (typ before alg). Standard JWT libraries
flip the order, which changes the signature and breaks all active sessions on cutover.

Fix: implement JWT in TypeScript using the Web Crypto API directly, preserving exact key order.
This makes PHP-issued and Deno-issued tokens mutually verifiable — no forced re-login on cutover.

---

## URL paths

All routes are mounted at the same paths the frontend already calls (`/api/employees.php` etc.)
so the Vue frontend requires zero changes during the migration.

---

## Railway config (deno-dev service)

**nixpacks.toml:**
```toml
[phases.setup]
nixPkgs = ["deno"]

[start]
cmd = "deno run --allow-net --allow-read --allow-write --allow-env deno-backend/main.ts"
```

**railway.toml:**
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "deno run --allow-net --allow-read --allow-write --allow-env deno-backend/main.ts"
healthcheckPath = "/api/health.php"
healthcheckTimeout = 10
```

---

## Phases

### Pre-work — Railway staging service
- [x] Railway Volume mounted at `/app/data` on production service
- [ ] Create second Railway service: same repo, branch = `deno-dev`
- [ ] Attach the same Volume to it, mounted at `/app/data`
- [ ] Note the new service URL (e.g. `timetrackingapp-deno.up.railway.app`) — used for testing

### Phase 0 — Foundation
- [ ] `deno-backend/` skeleton: `deno.json`, `main.ts`, `bootstrap.ts`
- [ ] `lib/config.ts`, `lib/db.ts`, `lib/jwt.ts`, `lib/auth.ts`
- [ ] `routes/health.ts`
- [ ] Update `nixpacks.toml` + `railway.toml` for Deno
- [ ] Deploy deno-dev service to Railway, confirm health check passes

### Phase 1 — Auth
- [ ] `lib/pin_rate_limit.ts`
- [ ] `routes/validate_pin.ts`
- [ ] `routes/admin_login.ts`
- [ ] `routes/salaxy_oauth_callback.ts`

### Phase 2 — Core CRUD
- [ ] `routes/employees.ts`, `supervisors.ts`, `company_admins.ts`
- [ ] `routes/time_entries.ts`, `review_entries.ts`, `clarify_entry.ts`
- [ ] `routes/update_language.ts`, `company_lang.ts`, `my_team.ts`, `supervisor_team.ts`, `logout.ts`

### Phase 3 — Company & super-admin
- [ ] `routes/companies.ts`, `create_company.ts`, `payroll_settings.ts`
- [ ] `routes/super_admin/update_company.ts`, `set_feature.ts`, `delete_company.ts`

### Phase 4 — Salaxy integration
- [ ] `lib/salaxy/token.ts`, `lib/salaxy/api.ts`
- [ ] `routes/fetch_business_id.ts`
- [ ] `routes/sync_employees_from_salaxy.ts`
- [ ] `routes/export_payroll.ts` ← most complex, dedicated testing required

### Phase 5 — Cutover
- [ ] Verify JWT compatibility: test PHP-issued token against Deno verifier
- [ ] Switch production Railway service to `deno-dev` (or merge → `main`)
- [ ] Remove PHP files in follow-up PR
- [ ] Update `CLAUDE.md` with new dev commands

---

## Key risks

| Risk | Mitigation |
|---|---|
| JWT key-order mismatch | Implement JWT manually with Web Crypto API, match PHP header encoding exactly |
| `export_payroll` regression | Run PHP and Deno side-by-side with same payload, diff responses |
| SQLite lost on redeploy | Railway Volume in place — done |
| Salaxy token cache invalidated | Same JSON file format — PHP and Deno share the cache |
| PIN rate-limit state lost | Stored in SQLite `pin_rate_limit` table — survives cutover |

---

## Effort estimate

| Phase | Estimate |
|---|---|
| 0 — Foundation | 0.5 day |
| 1 — Auth | 1 day |
| 2 — Core CRUD | 1.5 days |
| 3 — Company/super-admin | 0.5 day |
| 4 — Salaxy integration | 1.5 days |
| 5 — Cutover + cleanup | 0.5 day |
| **Total** | **~5.5 days** |
