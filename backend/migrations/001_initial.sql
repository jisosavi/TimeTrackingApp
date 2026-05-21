-- ── Master tables ────────────────────────────────────────────────────────────

CREATE TABLE super_admin_orgs (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT      NOT NULL,
  active     BOOLEAN   NOT NULL DEFAULT true,
  created_at TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE super_admins (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT    NOT NULL REFERENCES super_admin_orgs(id),
  email             TEXT      NOT NULL UNIQUE,
  password_hash     TEXT      NOT NULL,
  name              TEXT,
  active            BOOLEAN   NOT NULL DEFAULT true,
  ui_language       TEXT,
  salaxy_account_id TEXT,
  created_at        TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE companies (
  id                          BIGSERIAL PRIMARY KEY,
  name                        TEXT      NOT NULL,
  slug                        TEXT      UNIQUE,
  active                      BOOLEAN   NOT NULL DEFAULT true,
  approvals_enabled           BOOLEAN   NOT NULL DEFAULT false,
  time_app_enabled            BOOLEAN   NOT NULL DEFAULT true,
  supervisor_ui_enabled       BOOLEAN   NOT NULL DEFAULT true,
  salaxy_api_url              TEXT,
  salaxy_username             TEXT,
  salaxy_password             TEXT,
  salaxy_company_id           TEXT,
  salaxy_account_id           TEXT,
  payroll_period              TEXT      NOT NULL DEFAULT 'monthly',
  payday_1                    INTEGER   NOT NULL DEFAULT 15,
  payday_2                    INTEGER   NOT NULL DEFAULT 0,
  payroll_settings_updated_at TEXT,
  ui_language                 TEXT      NOT NULL DEFAULT 'en',
  country_code                TEXT      NOT NULL DEFAULT 'FI',
  super_admin_org_id          BIGINT    REFERENCES super_admin_orgs(id),
  created_at                  TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  -- db_file intentionally omitted
);

-- ── Company tables ────────────────────────────────────────────────────────────

CREATE TABLE company_admins (
  id            BIGSERIAL PRIMARY KEY,
  company_id    BIGINT    NOT NULL REFERENCES companies(id),
  email         TEXT      NOT NULL,
  password_hash TEXT      NOT NULL,
  name          TEXT,
  role          TEXT      NOT NULL DEFAULT 'company_admin',
  active        BOOLEAN   NOT NULL DEFAULT true,
  ui_language   TEXT,
  created_at    TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  UNIQUE(company_id, email)
);

CREATE TABLE employees (
  id                   BIGSERIAL PRIMARY KEY,
  company_id           BIGINT    NOT NULL REFERENCES companies(id),
  pin                  TEXT      NOT NULL,
  name                 TEXT      NOT NULL,
  email                TEXT,
  phone                TEXT,
  ssn                  TEXT,
  birth_year           INTEGER,
  salaxy_employment_id TEXT,
  role                 TEXT      NOT NULL DEFAULT 'employee',
  active               BOOLEAN   NOT NULL DEFAULT true,
  pin_locked           BOOLEAN   NOT NULL DEFAULT false,
  ui_language          TEXT,
  created_at           TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE supervisors (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT    NOT NULL REFERENCES companies(id),
  first_name  TEXT      NOT NULL,
  last_name   TEXT      NOT NULL,
  email       TEXT      NOT NULL,
  phone       TEXT      NOT NULL,
  pin         TEXT      NOT NULL,
  ssn         TEXT,
  salaxy_id   TEXT,
  active      BOOLEAN   NOT NULL DEFAULT true,
  pin_locked  BOOLEAN   NOT NULL DEFAULT false,
  ui_language TEXT,
  created_at  TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE supervisor_employees (
  supervisor_id BIGINT NOT NULL REFERENCES supervisors(id),
  employee_id   BIGINT NOT NULL REFERENCES employees(id),
  PRIMARY KEY (supervisor_id, employee_id)
);

CREATE TABLE time_entries (
  id                        BIGSERIAL     PRIMARY KEY,
  company_id                BIGINT        NOT NULL REFERENCES companies(id),
  employee_id               BIGINT        NOT NULL REFERENCES employees(id),
  entry_date                TEXT          NOT NULL,
  start_time                TEXT,
  end_time                  TEXT,
  hours                     NUMERIC(10,4) NOT NULL DEFAULT 0,
  km                        NUMERIC(10,4) NOT NULL DEFAULT 0,
  project                   TEXT,
  comment                   TEXT,
  status                    TEXT          NOT NULL DEFAULT 'pending',
  km_status                 TEXT          NOT NULL DEFAULT 'pending',
  submitted_at              TEXT          NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  reviewed_by_type          TEXT,
  reviewed_by_id            BIGINT,
  reviewed_at               TEXT,
  rejection_note            TEXT,
  km_rejection_note         TEXT,
  employee_clarification    TEXT,
  km_employee_clarification TEXT,
  clarification_at          TEXT,
  exported_to_salaxy        BOOLEAN       NOT NULL DEFAULT false,
  exported_at               TEXT
);

CREATE TABLE payroll_exports (
  id                BIGSERIAL PRIMARY KEY,
  company_id        BIGINT    NOT NULL REFERENCES companies(id),
  period_start      TEXT      NOT NULL,
  period_end        TEXT      NOT NULL,
  salaxy_payroll_id TEXT      NOT NULL,
  created_at        TEXT      NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  UNIQUE(company_id, period_start, period_end)
);

CREATE TABLE payroll_export_calculations (
  payroll_export_id     BIGINT NOT NULL REFERENCES payroll_exports(id),
  salaxy_employment_id  TEXT   NOT NULL,
  salaxy_calculation_id TEXT   NOT NULL,
  PRIMARY KEY (payroll_export_id, salaxy_employment_id)
);

CREATE TABLE pin_rate_limit (
  id                 BIGSERIAL PRIMARY KEY,
  company_id         BIGINT    NOT NULL REFERENCES companies(id),
  device_id          TEXT      NOT NULL,
  attempts           INTEGER   NOT NULL DEFAULT 0,
  window_start       BIGINT,
  locked_until       BIGINT,
  locked             BOOLEAN   NOT NULL DEFAULT false,
  strike             INTEGER   NOT NULL DEFAULT 0,
  last_employee_id   BIGINT,
  last_employee_type TEXT,
  UNIQUE(company_id, device_id)
);

CREATE TABLE holiday_proposals (
  id                BIGSERIAL PRIMARY KEY,
  company_id        BIGINT    NOT NULL REFERENCES companies(id),
  employee_id       BIGINT    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date        TEXT      NOT NULL,
  end_date          TEXT      NOT NULL,
  work_days         INTEGER   NOT NULL,
  label             TEXT,
  note              TEXT,
  source            TEXT      NOT NULL,
  status            TEXT      NOT NULL DEFAULT 'pending',
  decided_by        BIGINT    REFERENCES supervisors(id),
  decided_at        TEXT,
  decision_note     TEXT,
  salaxy_holiday_id TEXT,
  created_at        TEXT      NOT NULL,
  updated_at        TEXT      NOT NULL
);

CREATE TABLE absence_records (
  id                BIGSERIAL PRIMARY KEY,
  company_id        BIGINT    NOT NULL REFERENCES companies(id),
  employee_id       BIGINT    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  salaxy_absence_id TEXT,
  reason            TEXT      NOT NULL,
  start_date        TEXT      NOT NULL,
  end_date          TEXT      NOT NULL,
  days              INTEGER   NOT NULL,
  is_paid           BOOLEAN   NOT NULL DEFAULT true,
  affects_accrual   BOOLEAN   NOT NULL DEFAULT true,
  status            TEXT      NOT NULL DEFAULT 'pending',
  note              TEXT,
  decided_by        BIGINT    REFERENCES supervisors(id),
  decided_at        TEXT,
  decision_note     TEXT,
  created_at        TEXT      NOT NULL,
  updated_at        TEXT      NOT NULL
);

-- ── Merged audit log (company_id NULL = master-level event) ──────────────────

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT,
  ts          TEXT      NOT NULL,
  event       TEXT      NOT NULL,
  actor_type  TEXT      NOT NULL,
  actor_id    BIGINT,
  actor_ip    TEXT,
  resource    TEXT,
  resource_id TEXT,
  before_json TEXT,
  after_json  TEXT,
  outcome     TEXT      NOT NULL DEFAULT 'ok',
  meta_json   TEXT
);

-- ── Salaxy token cache (replaces data/salaxy_token_{id}.json files) ──────────

CREATE TABLE salaxy_tokens (
  company_id   BIGINT PRIMARY KEY REFERENCES companies(id),
  access_token TEXT   NOT NULL,
  expires_at   TEXT   NOT NULL,
  updated_at   TEXT   NOT NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_time_entries_company_employee ON time_entries(company_id, employee_id);
CREATE INDEX idx_time_entries_company_status   ON time_entries(company_id, status);
CREATE INDEX idx_proposals_status_emp          ON holiday_proposals(status, employee_id);
CREATE INDEX idx_proposals_dates               ON holiday_proposals(start_date, end_date);
CREATE INDEX idx_absences_status_emp           ON absence_records(status, employee_id);
CREATE INDEX idx_audit_company                 ON audit_log(company_id);

