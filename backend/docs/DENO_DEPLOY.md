# Deno Deploy² (DD²) — Deployment Guide

This backend is deployed to **Deno Deploy²** (the newer product at `console.deno.com`, not classic `dash.deno.com`).

> Replace `<org>` and `<app>` below with your own organization and app names.

## Why WSL2?

`deno deploy` is currently broken on **native Windows** — every file read fails with `os error 123 ... readfile '/C:/...'`. The bug is in `rs_lib.wasm` inside the `jsr:@deno/deploy` package; its file walker calls `sys_traits::impls::wasm_string_to_path`, which mangles Windows paths. Tracked upstream as [denoland/deno#33365](https://github.com/denoland/deno/issues/33365) (tagged `upstream` + `windows`), no fix yet.

Downgrading doesn't help: the bug landed in `@deno/deploy@0.0.56` (Aug 2025) when the Rust file walker was added, and older versions hit other dead ends (removed Deno internal ops, missing DD² API endpoints).

Linux Deno doesn't go through that code path, so the workaround is to run `deno deploy` from inside **WSL2**. The rest of the project (frontend dev, backend dev, tests) still runs natively on Windows — only the deploy step needs WSL2.

## One-time setup

### 1. WSL2

From an elevated PowerShell:

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

Set the variables your app requires in the dashboard, under your app's **Settings → Environment Variables**. For a backend like this, that typically includes a database connection string, a signing secret for sessions/JWTs, and any third-party API keys.

Notes:

- **Database host:** with a managed Postgres provider, use the **public / external** host, not an internal-only hostname — DD² runs outside your provider's private network. SSL is usually required for external connections (handled in `backend/lib/db.ts`).
- DD² assigns the port itself, so any `PORT` variable is ignored.

## Deploy

From a WSL shell:

```bash
cd /mnt/c/path/to/your-app
unset DENO_DEPLOY_TOKEN     # a classic-DD token here would break DD² auth
```

### First time — create the app

```bash
deno task create:<app>
```

This runs `deno deploy create` with all flags pre-filled (org, app, `source=local`, `runtime-mode=dynamic`, `entrypoint=backend/main.ts`, `region=eu`, no install/build/pre-deploy commands). It creates the app, writes a `deploy` block into `deno.json`, and does the first publish. The first run opens a browser for OAuth against `console.deno.com` — sign in with your organization.

### Subsequent deploys

```bash
deno task deploy:<app>
```

Each run creates a preview revision with its own URL. Promote to production by adding `--prod` to the task or via the dashboard.

## Verify

```bash
curl https://<deployed-url>/health
# expect: {"status":"ok"}
```

The deployed URL is printed at the end of the deploy and is also shown on your app's page in the DD² dashboard.

## Common gotchas

- **"Unable to interact with keychain" in WSL** — harmless. WSL has no desktop keychain, so the OAuth token isn't persisted between runs; you'll re-auth via browser each session.
- **`/mnt/c/.../nodejs/deno: exec: node: not found`** — Windows Deno leaking via PATH. Run `hash -r` and confirm `which deno` points to `~/.deno/bin/deno`.
- **"No runtime entrypoint provided" at build time** — framework auto-detect overrode the `--entrypoint` flag. Add `--do-not-use-detected-build-config` to the create task to force the explicit value.
- **Database refuses to connect** — make sure you're using the provider's public/external host rather than an internal-only one, and that SSL is enabled for non-internal hosts.
