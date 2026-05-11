// One-time seed: creates a super_admin_org + super_admin account.
// Run via: deno run --allow-read --allow-write --allow-env --allow-ffi deno-backend/scripts/seed_superadmin.ts
import { Database } from "@db/sqlite";
import bcrypt from "bcryptjs";

const DB_DIR = Deno.env.get("DB_DIR") ?? "./data";
const email = Deno.env.get("SA_EMAIL") ?? "admin@example.com";
const password = Deno.env.get("SA_PASSWORD") ?? "changeme";
const orgName = Deno.env.get("SA_ORG") ?? "Default Org";

Deno.mkdirSync(`${DB_DIR}/companies`, { recursive: true });
const db = new Database(`${DB_DIR}/master.sqlite`);

db.exec(`
  CREATE TABLE IF NOT EXISTS super_admin_orgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS super_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    ui_language TEXT,
    salaxy_account_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(org_id) REFERENCES super_admin_orgs(id)
  )
`);

const existing = db.prepare("SELECT id FROM super_admins WHERE email = ?").get(email);
if (existing) {
  console.log(`Super-admin ${email} already exists — nothing to do.`);
  db.close();
  Deno.exit(0);
}

const hash = await bcrypt.hash(password, 10);
db.prepare("INSERT INTO super_admin_orgs (name) VALUES (?)").run(orgName);
const orgId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
db.prepare(
  "INSERT INTO super_admins (org_id, email, password_hash, name) VALUES (?, ?, ?, ?)",
).run(orgId.id, email, hash, "Super Admin");

console.log(`Created super-admin: ${email} (org: ${orgName})`);
db.close();
