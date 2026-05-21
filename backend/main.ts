import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import bcrypt from "bcryptjs";
import { sql } from "./lib/db.ts";
import { runMigrations } from "./lib/migrate.ts";

const API_V = "/v01";
import health from "./routes/health.ts";
import validatePin from "./routes/validate_pin.ts";
import supervisorLogin from "./routes/supervisor_login.ts";
import adminLogin from "./routes/admin_login.ts";
import salaxyOauthCallback from "./routes/salaxy_oauth_callback.ts";
import employees from "./routes/employees.ts";
import supervisors from "./routes/supervisors.ts";
import companyAdmins from "./routes/company_admins.ts";
import timeEntries from "./routes/time_entries.ts";
import reviewEntries from "./routes/review_entries.ts";
import clarifyEntry from "./routes/clarify_entry.ts";
import updateLanguage from "./routes/update_language.ts";
import companyLang from "./routes/company_lang.ts";
import myTeam from "./routes/my_team.ts";
import supervisorTeam from "./routes/supervisor_team.ts";
import logout from "./routes/logout.ts";
import adminRoutes from "./routes/admin_routes.ts";
import companies from "./routes/companies.ts";
import payrollSettings from "./routes/payroll_settings.ts";
import superAdminRoutes from "./routes/super_admin_routes.ts";
import syncEmployees from "./routes/sync_employees.ts";
import exportPayroll from "./routes/export_payroll.ts";
import fetchBusinessId from "./routes/fetch_business_id.ts";
import llmProxy from "./routes/llm_proxy.ts";
import holidayYear from "./routes/holiday_year.ts";
import holidayProposals from "./routes/holiday_proposals.ts";
import absences from "./routes/absences.ts";
import supervisorTimeOff from "./routes/supervisor_time_off.ts";
import teamCalendar from "./routes/team_calendar.ts";
import adminTimeOff from "./routes/admin_time_off.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Run schema migrations on every startup (idempotent)
await runMigrations();

// Auto-seed super-admin on first boot if SA_EMAIL + SA_PASSWORD env vars are set
const saEmail = Deno.env.get("SA_EMAIL");
const saPassword = Deno.env.get("SA_PASSWORD");
if (saEmail && saPassword) {
  const [existing] = await sql`SELECT id FROM super_admins WHERE email = ${saEmail}`;
  if (!existing) {
    const hash = await bcrypt.hash(saPassword, 10);
    const [existingOrg] = await sql`SELECT id FROM super_admin_orgs LIMIT 1`;
    let orgId: unknown;
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const [newOrg] = await sql`INSERT INTO super_admin_orgs (name) VALUES ('Default') RETURNING id`;
      orgId = newOrg.id;
    }
    await sql`
      INSERT INTO super_admins (org_id, email, password_hash, name)
      VALUES (${orgId}, ${saEmail}, ${hash}, ${saEmail})
      ON CONFLICT (email) DO NOTHING
    `;
    console.log(`Seeded super-admin: ${saEmail}`);
  }
}

app.route("/", health);
app.route(API_V,validatePin);
app.route(API_V,supervisorLogin);
app.route(API_V,adminLogin);
app.route(API_V,salaxyOauthCallback);
app.route(API_V,employees);
app.route(API_V,supervisors);
app.route(API_V,companyAdmins);
app.route(API_V,timeEntries);
app.route(API_V,reviewEntries);
app.route(API_V,clarifyEntry);
app.route(API_V,updateLanguage);
app.route(API_V,companyLang);
app.route(API_V,myTeam);
app.route(API_V,supervisorTeam);
app.route(API_V,logout);
app.route(API_V,adminRoutes);
app.route(API_V,companies);
app.route(API_V,payrollSettings);
app.route(API_V,superAdminRoutes);
app.route(API_V,syncEmployees);
app.route(API_V,exportPayroll);
app.route(API_V,fetchBusinessId);
app.route(API_V,llmProxy);
app.route(API_V,holidayYear);
app.route(API_V,holidayProposals);
app.route(API_V,absences);
app.route(API_V,supervisorTimeOff);
app.route(API_V,teamCalendar);
app.route(API_V,adminTimeOff);

const port = parseInt(Deno.env.get("PORT") ?? "8080");
console.log(`Starting on port ${port}`);
Deno.serve({ port }, app.fetch);
