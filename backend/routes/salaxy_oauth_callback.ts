import { Hono } from "@hono/hono";
import { sql } from "../lib/db.ts";
import { generateToken } from "../lib/jwt.ts";
import { writeAudit, reqIp } from "../lib/audit.ts";

const app = new Hono();

const TOKEN_URL = "https://test-secure.salaxy.com/oauth2/token";
const SESSION_URL = "https://test-secure.salaxy.com/v03/api/session/current";

app.post("/api/salaxy_oauth_callback", async (c) => {
  const body = await c.req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  const redirectUri = String(body?.redirect_uri ?? "").trim();

  if (!code || !redirectUri) {
    return c.json({ success: false, error: "code and redirect_uri required" }, 400);
  }

  let tokenData: Record<string, unknown>;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: "time", redirect_uri: redirectUri }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    tokenData = await res.json();
    if (res.status !== 200 || !tokenData.access_token) {
      console.error("Salaxy token exchange failed:", res.status, JSON.stringify(tokenData));
      const msg = (tokenData.error_description ?? tokenData.error ?? "Token exchange failed") as string;
      return c.json({ success: false, error: msg }, 502);
    }
  } catch (e) {
    return c.json({ success: false, error: `Token exchange failed: ${e}` }, 502);
  }

  const salaxyToken = tokenData.access_token as string;

  let session: Record<string, unknown>;
  try {
    const res = await fetch(SESSION_URL, {
      headers: { "Authorization": `Bearer ${salaxyToken}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status !== 200) {
      return c.json({ success: false, error: "Failed to fetch Salaxy session" }, 502);
    }
    session = await res.json();
  } catch (e) {
    return c.json({ success: false, error: `Failed to fetch Salaxy session: ${e}` }, 502);
  }

  const cur = (session.currentAccount ?? session.account ?? session) as Record<string, unknown>;
  const salaxyAccountId = String(
    (cur as Record<string, Record<string, unknown>>).currentAccount?.id ??
    session.currentAccount?.id ??
    (session.account as Record<string, unknown>)?.id ??
    session.id ?? ""
  ).trim();

  if (!salaxyAccountId) {
    console.error("Salaxy session/current: could not find account id in:", JSON.stringify(session));
    return c.json({ success: false, error: "Could not determine Salaxy account ID" }, 502);
  }

  let admin = (await sql`SELECT * FROM super_admins WHERE salaxy_account_id = ${salaxyAccountId} AND active = TRUE LIMIT 1`)[0] as Record<string, unknown> | undefined;

  if (!admin) {
    const [countRow] = await sql`SELECT COUNT(*) AS n FROM super_admins WHERE active = TRUE`;
    const [unlinked] = await sql`SELECT * FROM super_admins WHERE salaxy_account_id IS NULL AND active = TRUE LIMIT 1`;

    if (Number(countRow.n) === 1 && unlinked) {
      admin = unlinked as Record<string, unknown>;
    } else {
      console.error("Salaxy OAuth2: unauthorized account ID:", salaxyAccountId);
      return c.json({ success: false, error: "Not authorized" }, 403);
    }
  }

  const sesAvat = (session.avatar ?? {}) as Record<string, unknown>;
  const av = (Array.isArray(cur.avatar) ? {} : (cur.avatar ?? {})) as Record<string, unknown>;
  const cred = (session.currentCredential ?? {}) as Record<string, unknown>;
  const contact = (cur.contact ?? {}) as Record<string, unknown>;

  const salaxyName = (
    `${sesAvat.firstName ?? ""} ${sesAvat.lastName ?? ""}`.trim() ||
    `${av.firstName ?? ""} ${av.lastName ?? ""}`.trim() ||
    (cur.name as string) || (session.name as string) || ""
  ).trim();

  const salaxyEmail = (
    cred.login ?? cred.username ?? cred.email ??
    contact.email ?? contact.login ??
    sesAvat.email ?? sesAvat.login ??
    cur.email ?? cur.login ?? ""
  ) as string;

  const salaxyAvatarUrl = (
    sesAvat.url ?? sesAvat.imageUrl ?? sesAvat.pictureUrl ?? sesAvat.thumbnailUrl ??
    sesAvat.smallUrl ?? sesAvat.href ??
    av.url ?? av.imageUrl ?? av.pictureUrl ?? av.thumbnailUrl ?? ""
  ) as string;

  await sql`
    UPDATE super_admins
    SET salaxy_account_id = ${salaxyAccountId}, name = CASE WHEN ${salaxyName} != '' THEN ${salaxyName} ELSE name END
    WHERE id = ${admin.id as number}
  `;

  if (salaxyEmail) {
    try {
      await sql`UPDATE super_admins SET email = ${salaxyEmail} WHERE id = ${admin.id as number} AND (email IS NULL OR email = '')`;
    } catch { /* UNIQUE conflict — skip */ }
  }

  const [updated] = await sql`SELECT * FROM super_admins WHERE id = ${admin.id as number}`;
  admin = updated as Record<string, unknown>;

  const token = await generateToken(admin.id as number, "superadmin", 0);

  writeAudit(0, {
    event: "auth.login.success",
    actorType: "superadmin",
    actorId: admin.id as number,
    actorIp: reqIp(c.req.header("x-forwarded-for")),
    resource: "super_admin",
    resourceId: String(admin.id),
  });

  return c.json({
    success: true,
    token,
    user: {
      id: admin.id,
      type: "superadmin",
      companyId: 0,
      name: (admin.name as string) || salaxyName || "Super Admin",
      email: salaxyEmail || admin.email,
      avatarUrl: salaxyAvatarUrl || null,
      uiLanguage: (admin.ui_language as string) ?? "en",
    },
  });
});

export default app;
