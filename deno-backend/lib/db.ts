import { Database } from "@db/sqlite";
import { DB_DIR } from "./config.ts";
import { initCompanyDb, initMasterDb } from "../bootstrap.ts";

let _masterDb: Database | null = null;
const _companyDbs = new Map<number, Database>();

export function getMasterDb(): Database {
  if (_masterDb) return _masterDb;
  Deno.mkdirSync(`${DB_DIR}/companies`, { recursive: true });
  _masterDb = new Database(`${DB_DIR}/master.sqlite`);
  initMasterDb(_masterDb);
  return _masterDb;
}

export function getCompanyDb(companyId: number): Database {
  const cached = _companyDbs.get(companyId);
  if (cached) return cached;
  const db = new Database(`${DB_DIR}/companies/${companyId}.sqlite`);
  initCompanyDb(db);
  _companyDbs.set(companyId, db);
  return db;
}

export function getCompanyDbBySlug(slug: string): Database {
  const row = getMasterDb()
    .prepare("SELECT id FROM companies WHERE slug = ?")
    .get(slug) as { id: number } | undefined;
  if (!row) throw new Error(`Company not found: ${slug}`);
  return getCompanyDb(row.id);
}
