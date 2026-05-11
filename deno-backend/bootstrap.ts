import { Database } from "@db/sqlite";

type PragmaRow = { name: string };

function cols(db: Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as PragmaRow[]).map((r) => r.name);
}

export function initMasterDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS super_admin_orgs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id        INTEGER NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      name          TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      ui_language   TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(org_id) REFERENCES super_admin_orgs(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      name                        TEXT    NOT NULL,
      slug                        TEXT    UNIQUE,
      active                      INTEGER NOT NULL DEFAULT 1,
      approvals_enabled           INTEGER NOT NULL DEFAULT 0,
      salaxy_api_url              TEXT,
      salaxy_username             TEXT,
      salaxy_password             TEXT,
      payroll_period              TEXT    NOT NULL DEFAULT 'monthly',
      payday_1                    INTEGER NOT NULL DEFAULT 15,
      payday_2                    INTEGER NOT NULL DEFAULT 0,
      payroll_settings_updated_at TEXT,
      ui_language                 TEXT    NOT NULL DEFAULT 'en',
      salaxy_company_id           TEXT,
      db_file                     TEXT,
      super_admin_org_id          INTEGER,
      created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(super_admin_org_id) REFERENCES super_admin_orgs(id)
    )
  `);

  const companyCols = cols(db, "companies");
  if (!companyCols.includes("active"))
    db.exec("ALTER TABLE companies ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  if (!companyCols.includes("approvals_enabled"))
    db.exec("ALTER TABLE companies ADD COLUMN approvals_enabled INTEGER NOT NULL DEFAULT 0");
  if (!companyCols.includes("payroll_period"))
    db.exec("ALTER TABLE companies ADD COLUMN payroll_period TEXT NOT NULL DEFAULT 'monthly'");
  if (!companyCols.includes("payday_1"))
    db.exec("ALTER TABLE companies ADD COLUMN payday_1 INTEGER NOT NULL DEFAULT 15");
  if (!companyCols.includes("payday_2"))
    db.exec("ALTER TABLE companies ADD COLUMN payday_2 INTEGER NOT NULL DEFAULT 0");
  if (!companyCols.includes("payroll_settings_updated_at"))
    db.exec("ALTER TABLE companies ADD COLUMN payroll_settings_updated_at TEXT");
  if (!companyCols.includes("ui_language"))
    db.exec("ALTER TABLE companies ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'en'");
  if (!companyCols.includes("salaxy_company_id"))
    db.exec("ALTER TABLE companies ADD COLUMN salaxy_company_id TEXT");
  if (!companyCols.includes("salaxy_account_id"))
    db.exec("ALTER TABLE companies ADD COLUMN salaxy_account_id TEXT");
  if (!companyCols.includes("db_file"))
    db.exec("ALTER TABLE companies ADD COLUMN db_file TEXT");
  if (!companyCols.includes("super_admin_org_id"))
    db.exec("ALTER TABLE companies ADD COLUMN super_admin_org_id INTEGER");
  if (!companyCols.includes("time_app_enabled"))
    db.exec("ALTER TABLE companies ADD COLUMN time_app_enabled INTEGER NOT NULL DEFAULT 1");
  if (!companyCols.includes("supervisor_ui_enabled"))
    db.exec("ALTER TABLE companies ADD COLUMN supervisor_ui_enabled INTEGER NOT NULL DEFAULT 1");
  if (!companyCols.includes("country_code"))
    db.exec("ALTER TABLE companies ADD COLUMN country_code TEXT NOT NULL DEFAULT 'FI'");

  const saCols = cols(db, "super_admins");
  if (!saCols.includes("salaxy_account_id"))
    db.exec("ALTER TABLE super_admins ADD COLUMN salaxy_account_id TEXT");
}

export function initCompanyDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_admins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id    INTEGER,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      name          TEXT,
      role          TEXT    NOT NULL DEFAULT 'company_admin',
      active        INTEGER NOT NULL DEFAULT 1,
      ui_language   TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id           INTEGER NOT NULL,
      pin                  TEXT    NOT NULL,
      name                 TEXT    NOT NULL,
      ssn                  TEXT,
      salaxy_employment_id TEXT,
      role                 TEXT    NOT NULL DEFAULT 'employee',
      active               INTEGER NOT NULL DEFAULT 1,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS supervisors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      first_name TEXT    NOT NULL,
      last_name  TEXT    NOT NULL,
      email      TEXT    NOT NULL,
      phone      TEXT    NOT NULL,
      pin        TEXT    NOT NULL,
      ssn        TEXT,
      salaxy_id  TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS supervisor_employees (
      supervisor_id INTEGER NOT NULL,
      employee_id   INTEGER NOT NULL,
      PRIMARY KEY (supervisor_id, employee_id),
      FOREIGN KEY(supervisor_id) REFERENCES supervisors(id),
      FOREIGN KEY(employee_id)   REFERENCES employees(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id                INTEGER NOT NULL,
      employee_id               INTEGER NOT NULL,
      entry_date                TEXT    NOT NULL,
      start_time                TEXT,
      end_time                  TEXT,
      hours                     REAL    NOT NULL DEFAULT 0,
      km                        REAL    NOT NULL DEFAULT 0,
      project                   TEXT,
      comment                   TEXT,
      status                    TEXT    NOT NULL DEFAULT 'pending',
      km_status                 TEXT    NOT NULL DEFAULT 'pending',
      submitted_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      reviewed_by_type          TEXT,
      reviewed_by_id            INTEGER,
      reviewed_at               TEXT,
      rejection_note            TEXT,
      km_rejection_note         TEXT,
      employee_clarification    TEXT,
      km_employee_clarification TEXT,
      clarification_at          TEXT,
      exported_to_salaxy        INTEGER NOT NULL DEFAULT 0,
      exported_at               TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_exports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id        INTEGER NOT NULL,
      period_start      TEXT    NOT NULL,
      period_end        TEXT    NOT NULL,
      salaxy_payroll_id TEXT    NOT NULL,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, period_start, period_end)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_export_calculations (
      payroll_export_id     INTEGER NOT NULL,
      salaxy_employment_id  TEXT    NOT NULL,
      salaxy_calculation_id TEXT    NOT NULL,
      PRIMARY KEY (payroll_export_id, salaxy_employment_id),
      FOREIGN KEY(payroll_export_id) REFERENCES payroll_exports(id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pin_rate_limit (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id         INTEGER NOT NULL,
      device_id          TEXT    NOT NULL,
      attempts           INTEGER NOT NULL DEFAULT 0,
      window_start       INTEGER,
      locked_until       INTEGER,
      locked             INTEGER NOT NULL DEFAULT 0,
      strike             INTEGER NOT NULL DEFAULT 0,
      last_employee_id   INTEGER,
      last_employee_type TEXT,
      UNIQUE(company_id, device_id)
    )
  `);

  const admCols = cols(db, "company_admins");
  if (!admCols.includes("ui_language"))
    db.exec("ALTER TABLE company_admins ADD COLUMN ui_language TEXT");

  const empCols = cols(db, "employees");
  if (!empCols.includes("ui_language"))
    db.exec("ALTER TABLE employees ADD COLUMN ui_language TEXT");
  if (!empCols.includes("email"))
    db.exec("ALTER TABLE employees ADD COLUMN email TEXT");
  if (!empCols.includes("phone"))
    db.exec("ALTER TABLE employees ADD COLUMN phone TEXT");
  if (!empCols.includes("birth_year"))
    db.exec("ALTER TABLE employees ADD COLUMN birth_year INTEGER");
  if (!empCols.includes("pin_locked"))
    db.exec("ALTER TABLE employees ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0");

  const supCols = cols(db, "supervisors");
  if (!supCols.includes("ui_language"))
    db.exec("ALTER TABLE supervisors ADD COLUMN ui_language TEXT");
  if (!supCols.includes("pin_locked"))
    db.exec("ALTER TABLE supervisors ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0");
  if (!supCols.includes("salaxy_id"))
    db.exec("ALTER TABLE supervisors ADD COLUMN salaxy_id TEXT");

  const teCols = cols(db, "time_entries");
  if (!teCols.includes("km_status")) {
    db.exec("ALTER TABLE time_entries ADD COLUMN km_status TEXT NOT NULL DEFAULT 'pending'");
    db.exec("UPDATE time_entries SET km_status = status WHERE status != 'pending'");
  }
  if (!teCols.includes("km_rejection_note"))
    db.exec("ALTER TABLE time_entries ADD COLUMN km_rejection_note TEXT");
  if (!teCols.includes("km_employee_clarification"))
    db.exec("ALTER TABLE time_entries ADD COLUMN km_employee_clarification TEXT");
}
