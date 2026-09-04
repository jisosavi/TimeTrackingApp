import { Hono } from "@hono/hono";
import { requireAdmin } from "../lib/auth.ts";
import { sql } from "../lib/db.ts";
import { verifyToken } from "../lib/jwt.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";
import { getCompanyCreds, salaxyRequest } from "../lib/salaxy.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

// Only row-scoped dimensions can be set per time entry, so nothing else is stored.
const USABLE_SCOPE = "row";

interface SalaxyOption { value?: string; text?: string; path?: string }
interface SalaxyDimension {
  id?: string;
  label?: string;
  scope?: string;
  allowCostSharing?: boolean;
  options?: SalaxyOption[];
}

function bearerToken(authHeader: string | undefined): string {
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

/**
 * Pulls dimension definitions from Salaxy. Read-only by design: Salaxy's
 * POST /settings/dimensions/all replaces every dimension on the account, so this
 * app must never write back.
 */
app.post("/api/sync_dimensions_from_salaxy", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const creds = await getCompanyCreds(companyId);

  const resp = await salaxyRequest("GET", "/settings/dimensions", null, creds);
  if (!resp.success || !Array.isArray(resp.data)) {
    return c.json({ success: false, error: "Salaxy-haku epäonnistui", httpCode: resp.httpCode }, 502);
  }

  const all = resp.data as SalaxyDimension[];
  const usable = all.filter((d) => d.id && d.scope === USABLE_SCOPE);
  const now = new Date().toISOString();

  for (const dim of usable) {
    const dimensionId = String(dim.id);
    await sql`
      INSERT INTO company_dimensions (company_id, dimension_id, label, scope, allow_cost_sharing, enabled, synced_at)
      VALUES (${companyId}, ${dimensionId}, ${dim.label ?? ""}, ${dim.scope ?? USABLE_SCOPE}, ${dim.allowCostSharing === true}, FALSE, ${now})
      ON CONFLICT (company_id, dimension_id) DO UPDATE SET
        label = EXCLUDED.label,
        scope = EXCLUDED.scope,
        allow_cost_sharing = EXCLUDED.allow_cost_sharing,
        synced_at = EXCLUDED.synced_at
    `;

    const options = Array.isArray(dim.options) ? dim.options.filter((o) => o.value != null) : [];
    for (const opt of options) {
      await sql`
        INSERT INTO company_dimension_options (company_id, dimension_id, value, option_text, path, active)
        VALUES (${companyId}, ${dimensionId}, ${String(opt.value)}, ${opt.text ?? ""}, ${opt.path ?? null}, TRUE)
        ON CONFLICT (company_id, dimension_id, value) DO UPDATE SET
          option_text = EXCLUDED.option_text,
          path = EXCLUDED.path,
          active = TRUE
      `;
    }

    // Options withdrawn in Salaxy are deactivated, never deleted: historical
    // entries still reference them.
    const keep = options.map((o) => String(o.value));
    await sql`
      UPDATE company_dimension_options SET active = FALSE
      WHERE company_id = ${companyId} AND dimension_id = ${dimensionId}
        AND NOT (value = ANY(${keep}))
    `;
  }

  writeAudit(companyId, {
    event: "dimensions.synced",
    actorType: "admin",
    actorId: Number(admin.id),
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "dimensions",
    after: { synced: usable.length, skipped: all.length - usable.length },
  });

  return c.json({
    success: true,
    synced: usable.length,
    skipped: all.length - usable.length,
    skippedReason: all.length > usable.length ? `ei row-tason dimensioita: ${all.length - usable.length}` : null,
  });
});

/** Everything synced for this company, for the admin's selection screen. */
app.get("/api/dimensions", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;

  const dimensions = await sql`
    SELECT dimension_id, label, scope, allow_cost_sharing, enabled, synced_at
    FROM company_dimensions WHERE company_id = ${companyId}
    ORDER BY label, dimension_id
  `;
  const options = await sql`
    SELECT dimension_id, value, option_text, active
    FROM company_dimension_options WHERE company_id = ${companyId}
    ORDER BY dimension_id, option_text, value
  `;

  return c.json({ success: true, dimensions, options });
});

/**
 * Enables a single dimension for time tracking, or none. Exclusive by design:
 * an entry carries one dimension value in this iteration.
 */
app.post("/api/dimensions/enabled", requireAdmin, async (c) => {
  const admin = c.get("user") as Record<string, unknown>;
  const companyId = admin.company_id as number;
  const body = await c.req.json().catch(() => ({}));
  const dimensionId = body.dimension_id == null ? null : String(body.dimension_id);

  if (dimensionId !== null) {
    const [exists] = await sql`
      SELECT 1 FROM company_dimensions
      WHERE company_id = ${companyId} AND dimension_id = ${dimensionId} AND scope = ${USABLE_SCOPE}
    `;
    if (!exists) return c.json({ success: false, error: "Tuntematon dimensio" }, 400);
  }

  await sql`UPDATE company_dimensions SET enabled = FALSE WHERE company_id = ${companyId}`;
  if (dimensionId !== null) {
    await sql`
      UPDATE company_dimensions SET enabled = TRUE
      WHERE company_id = ${companyId} AND dimension_id = ${dimensionId}
    `;
  }

  writeAudit(companyId, {
    event: "dimensions.enabled_changed",
    actorType: "admin",
    actorId: Number(admin.id),
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "dimensions",
    after: { dimension_id: dimensionId },
  });

  return c.json({ success: true, dimension_id: dimensionId });
});

/**
 * The enabled dimension and its selectable options, for anyone logged in to the
 * company. Employees need this to fill the selector on the preview card.
 */
app.get("/api/dimensions/active", async (c) => {
  const claims = await verifyToken(bearerToken(c.req.header("Authorization")));
  if (!claims) return c.json({ success: false, error: "Unauthorized" }, 401);
  const companyId = claims["company_id"] as number;

  const [dim] = await sql`
    SELECT dimension_id, label FROM company_dimensions
    WHERE company_id = ${companyId} AND enabled = TRUE AND scope = ${USABLE_SCOPE}
  `;
  if (!dim) return c.json({ success: true, dimension: null, options: [] });

  const options = await sql`
    SELECT value, option_text FROM company_dimension_options
    WHERE company_id = ${companyId} AND dimension_id = ${dim.dimension_id as string} AND active = TRUE
    ORDER BY option_text, value
  `;
  return c.json({ success: true, dimension: dim, options });
});

export default app;
