import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { getMasterDb } from "./lib/db.ts";
import bcrypt from "bcryptjs";
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

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

const db = getMasterDb(); // init schema + fail fast if DB is unavailable

// Auto-seed super-admin on first boot if SA_EMAIL + SA_PASSWORD env vars are set
const saEmail = Deno.env.get("SA_EMAIL");
const saPassword = Deno.env.get("SA_PASSWORD");
if (saEmail && saPassword) {
  const existing = db.prepare("SELECT id FROM super_admins WHERE email = ?").get(saEmail);
  if (!existing) {
    const hash = await bcrypt.hash(saPassword, 10);
    db.prepare("INSERT OR IGNORE INTO super_admin_orgs (name) VALUES ('Default')").run();
    const org = db.prepare("SELECT id FROM super_admin_orgs LIMIT 1").get() as { id: number };
    db.prepare("INSERT INTO super_admins (org_id, email, password_hash, name) VALUES (?, ?, ?, ?)").run(
      org.id, saEmail, hash, saEmail,
    );
    console.log(`Seeded super-admin: ${saEmail}`);
  }
}

app.route("/", health);
app.route("/", validatePin);
app.route("/", supervisorLogin);
app.route("/", adminLogin);
app.route("/", salaxyOauthCallback);
app.route("/", employees);
app.route("/", supervisors);
app.route("/", companyAdmins);
app.route("/", timeEntries);
app.route("/", reviewEntries);
app.route("/", clarifyEntry);
app.route("/", updateLanguage);
app.route("/", companyLang);
app.route("/", myTeam);
app.route("/", supervisorTeam);
app.route("/", logout);
app.route("/", adminRoutes);
app.route("/", companies);
app.route("/", payrollSettings);
app.route("/", superAdminRoutes);
app.route("/", syncEmployees);
app.route("/", exportPayroll);
app.route("/", fetchBusinessId);
app.route("/", llmProxy);
app.route("/", holidayYear);
app.route("/", holidayProposals);
app.route("/", absences);
app.route("/", supervisorTimeOff);
app.route("/", teamCalendar);

const port = parseInt(Deno.env.get("PORT") ?? "8080");
console.log(`Starting on port ${port}`);
Deno.serve({ port }, app.fetch);
