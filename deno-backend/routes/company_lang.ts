import { Hono } from "@hono/hono";
import { getMasterDb } from "../lib/db.ts";

const app = new Hono();

app.get("/api/company_lang.php", (c) => {
  const slug = String(c.req.query("slug") ?? "").trim();
  if (!slug) return c.json({ ui_language: "en" });

  try {
    const row = getMasterDb().prepare(
      "SELECT ui_language FROM companies WHERE slug = ? AND active = 1 LIMIT 1"
    ).get(slug) as { ui_language: string | null } | undefined;
    return c.json({ ui_language: row?.ui_language ?? "en" });
  } catch {
    return c.json({ ui_language: "en" });
  }
});

export default app;
