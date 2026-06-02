# Deno Deploy² (DD²) — Deployment Guide

This backend is deployed to Deno Deploy² (the new product at `console.deno.com`,
not classic `dash.deno.com`) as the **salaxy-timetracking-test** app under the
**salaxy** organization.

## Why WSL2?

`deno deploy` is broken on native Windows — every file read fails with
`os error 123 ... readfile '/C:/...'`. The bug is in `rs_lib.wasm` inside the
`jsr:@deno/deploy` package; its file walker calls
`sys_traits::impls::wasm_string_to_path` which mangles Windows paths. Tracked
upstream as [denoland/deno#33365](https://github.com/denoland/deno/issues/33365),
tagged `upstream`+`windows`, no fix yet.

Downgrading doesn't help: the bug landed in `@deno/deploy@0.0.56` (Aug 2025) when
the Rust file walker was added, and older versions hit other dead ends
(removed Deno internal ops, missing DD² API endpoints).

Linux Deno doesn't go through that code path, so the fix is to run `deno deploy`
from inside WSL2. The rest of the project (frontend dev, backend dev, tests)
still runs natively on Windows — only the deploy step needs WSL2.

## One-time setup

### 1. WSL2

From elevated PowerShell:

```powershell
wsl --status            # check first
wsl --install           # only if not installed; reboot afterward
```

### 2. Deno inside WSL

In a WSL shell (`wsl` from PowerShell):

```bash
sudo apt update && sudo apt install -y unzip
curl -fsSL https://deno.land/install.sh | sh
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
hash -r                 # forget the Windows `deno` that leaks via /mnt/c PATH
which deno              # must print /home/<user>/.deno/bin/deno, not /mnt/c/...
```

### 3. Environment variables on the DD² app

Set in the dashboard at
`https://console.deno.com/salaxy/salaxy-timetracking-test/settings`:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Railway **public** Postgres URL (`postgresql://...@<host>.proxy.rlwy.net:<port>/railway`). Do **not** use the `.railway.internal` URL. |
| `JWT_SECRET` | Must match Railway's so existing tokens stay valid |
| `GEMINI_API_KEY` | Copy from Railway |
| `SALAXY_API_URL` | Copy from Railway |
| `SALAXY_TOKEN_URL` | Copy from Railway |
| `SALAXY_USERNAME` | Copy from Railway |
| `SALAXY_PASSWORD` | Copy from Railway |

Omit `SA_EMAIL` / `SA_PASSWORD` (super-admin already seeded in the shared DB)
and `PORT` (DD² ignores it).

## Deploy

From a WSL shell:

```bash
cd /mnt/c/src/TimeTrackingApp
unset DENO_DEPLOY_TOKEN     # any classic-DD token here would break DD² auth
```

### First time — create the app

```bash
deno task create:salaxy-timetracking-test
```

This runs `deno deploy create` with all flags pre-filled (org, app, source=local,
runtime-mode=dynamic, entrypoint=backend/main.ts, region=eu, no install/build/
pre-deploy commands). It creates the app, writes a `"deploy"` block into
`deno.json`, and does the first publish. First run opens a browser for OAuth
against `console.deno.com` — sign in with the Salaxy org.

### Subsequent deploys

```bash
deno task deploy:salaxy-timetracking-test
```

Each run creates a **preview** revision with its own URL. Promote to production
by adding `--prod` to the task or via the dashboard.

## Verify

```bash
curl https://<deployed-url>/health
# expect: {"status":"ok"}
```

The deployed URL is printed at the end of the deploy and is also at
`https://console.deno.com/salaxy/salaxy-timetracking-test`.

## Common gotchas

- **"Unable to interact with keychain"** in WSL is harmless — WSL has no desktop
  keychain, so the OAuth token isn't persisted between runs. You'll re-auth via
  browser each session.
- **`/mnt/c/Program Files/nodejs/deno: exec: node: not found`** — Windows Deno
  leaking via PATH. Run `hash -r` and check `which deno` points to
  `~/.deno/bin/deno`.
- **"No runtime entrypoint provided"** at build time — framework-detect
  overrode the `--entrypoint` flag. Add `--do-not-use-detected-build-config` to
  the create task to force the explicit value.
- **DATABASE_URL refuses to connect** — make sure you're using the
  `.proxy.rlwy.net` host, not `.railway.internal`. SSL is auto-required by
  `backend/lib/db.ts` for non-internal hosts.
