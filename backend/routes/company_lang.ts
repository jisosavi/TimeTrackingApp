import { Hono } from "@hono/hono";
import { sql } from "../lib/db.ts";

const app = new Hono();

app.get("/api/company_lang", async (c) => {
  const slug = String(c.req.query("slug") ?? "").trim();
  if (!slug) return c.json({ ui_language: "en" });

  try {
    const [row] = await sql`
      SELECT ui_language FROM companies WHERE slug = ${slug} AND active = TRUE LIMIT 1
    `;
    return c.json({ ui_language: (row?.ui_language as string | null) ?? "en" });
  } catch {
    return c.json({ ui_language: "en" });
  }
});

export default app;
