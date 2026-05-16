import { Hono } from "@hono/hono";
import { requireEmployee } from "../lib/auth.ts";
import { getCompanyCreds, getHolidayYears } from "../lib/salaxy.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.get("/api/holiday_year", requireEmployee, async (c) => {
  const emp = c.get("user") as Record<string, unknown>;
  const year = parseInt(c.req.query("year") ?? String(new Date().getFullYear()), 10);
  const salaxyId = emp.salaxy_employment_id as string | null;
  if (!salaxyId) return c.json({ holidayYear: null });

  try {
    const creds = getCompanyCreds(emp.company_id as number);
    const years = await getHolidayYears(salaxyId, creds);
    const hy = years.find((y) => y.year === year) ?? years[0] ?? null;
    return c.json({ holidayYear: hy });
  } catch (err) {
    console.error("[holiday_year] Salaxy error", err);
    return c.json({ holidayYear: null, error: "salaxy_unavailable" }, 502);
  }
});

export default app;
