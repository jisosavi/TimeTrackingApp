import { sql } from "./db.ts";

export async function runMigrations(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  `;

  const dir = new URL("../migrations/", import.meta.url);
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) files.push(entry.name);
  }
  files.sort();

  const applied = new Set(
    (await sql`SELECT version FROM schema_migrations`.values()).flat(),
  );

  for (const file of files) {
    const version = file.replace(".sql", "");
    if (applied.has(version)) continue;

    console.log(`[migrate] applying ${version}`);
    const ddl = await Deno.readTextFile(new URL(file, dir));
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
    console.log(`[migrate] ${version} done`);
  }
}
