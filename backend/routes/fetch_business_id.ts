import { Hono } from "@hono/hono";
import { requireSuperAdmin } from "../lib/auth.ts";
import { getMasterDb } from "../lib/db.ts";
import { getCompanyCreds, getSalaxyToken, salaxyRequest } from "../lib/salaxy.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

function parseYtunnus(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const last8 = digits.slice(-8);
  return `${last8.slice(0, 7)}-${last8[7]}`;
}

app.get("/api/fetch_business_id", requireSuperAdmin, async (c) => {
  const companyId = Number(c.req.query("company_id") ?? 0);
  if (!companyId) return c.json({ success: false, error: "company_id required" }, 400);

  const company = getMasterDb().prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
  if (!company) return c.json({ success: false, error: "Company not found" }, 404);

  const creds = getCompanyCreds(companyId);
  if (!creds.username || !creds.password) {
    return c.json({ success: false, error: "Salaxy credentials not configured for this company" }, 422);
  }

  const token = await getSalaxyToken(creds);
  if (!token) return c.json({ success: false, error: "Failed to get Salaxy access token" }, 502);

  const res = await salaxyRequest("GET", "/employments", null, creds);
  if (res.success) {
    const items = (res.data as Record<string, unknown>)?.items;
    if (Array.isArray(items)) {
      for (const item of items as Record<string, unknown>[]) {
        const officialId = (item.selfPartyInfo as Record<string, unknown>)?.officialId as string | undefined;
        if (officialId) {
          const ytunnus = parseYtunnus(officialId);
          if (ytunnus) return c.json({ success: true, business_id: ytunnus, salaxy_account_id: officialId });
        }
      }
      for (const item of items as Record<string, unknown>[]) {
        const selfId = item.selfId as string | undefined;
        if (selfId) {
          const ytunnus = parseYtunnus(selfId);
          if (ytunnus) return c.json({ success: true, business_id: ytunnus, salaxy_account_id: selfId });
        }
      }
      for (const item of items as Record<string, unknown>[]) {
        const owner = item.owner as string | undefined;
        if (owner) {
          const ytunnus = parseYtunnus(owner);
          if (ytunnus) return c.json({ success: true, business_id: ytunnus, salaxy_account_id: owner });
        }
      }
    }
  }

  return c.json({ success: false, error: "Could not determine Business ID from Salaxy API" }, 404);
});

export default app;
