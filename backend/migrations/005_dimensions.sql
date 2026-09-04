-- Cost accounting dimensions pulled (read-only) from Salaxy. Only row-scoped
-- dimensions are stored: a time entry becomes a calculation row.
CREATE TABLE IF NOT EXISTS company_dimensions (
  company_id         BIGINT  NOT NULL REFERENCES companies(id),
  dimension_id       TEXT    NOT NULL,
  label              TEXT    NOT NULL DEFAULT '',
  scope              TEXT    NOT NULL DEFAULT 'row',
  allow_cost_sharing BOOLEAN NOT NULL DEFAULT FALSE,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at          TEXT    NOT NULL,
  PRIMARY KEY (company_id, dimension_id)
);

-- active = FALSE when an option disappears from Salaxy but historical entries
-- still reference it.
CREATE TABLE IF NOT EXISTS company_dimension_options (
  company_id   BIGINT  NOT NULL REFERENCES companies(id),
  dimension_id TEXT    NOT NULL,
  value        TEXT    NOT NULL,
  option_text  TEXT    NOT NULL DEFAULT '',
  path         TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (company_id, dimension_id, value)
);

-- One row per entry today; percent exists so cost-splitting is additive later.
CREATE TABLE IF NOT EXISTS time_entry_dimensions (
  entry_id     BIGINT       NOT NULL REFERENCES time_entries(id),
  dimension_id TEXT         NOT NULL,
  value        TEXT         NOT NULL,
  percent      NUMERIC(6,3) NOT NULL DEFAULT 100,
  PRIMARY KEY (entry_id, dimension_id)
);
