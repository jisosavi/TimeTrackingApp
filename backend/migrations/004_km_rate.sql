CREATE TABLE IF NOT EXISTS salaxy_km_allowance (
  company_id BIGINT        NOT NULL REFERENCES companies(id),
  year       INTEGER       NOT NULL,
  rate       NUMERIC(10,4) NOT NULL,
  updated_at TEXT          NOT NULL,
  PRIMARY KEY (company_id, year)
);

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS km_rate NUMERIC(10,4);
