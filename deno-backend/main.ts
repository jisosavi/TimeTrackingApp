import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { getMasterDb } from "./lib/db.ts";
import health from "./routes/health.ts";
import validatePin from "./routes/validate_pin.ts";
import supervisorLogin from "./routes/supervisor_login.ts";
import adminLogin from "./routes/admin_login.ts";
import salaxyOauthCallback from "./routes/salaxy_oauth_callback.ts";

const app = new Hono<{ Variables: Record<string, unknown> }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

getMasterDb(); // init schema + fail fast if DB is unavailable

app.route("/", health);
app.route("/", validatePin);
app.route("/", supervisorLogin);
app.route("/", adminLogin);
app.route("/", salaxyOauthCallback);

const port = parseInt(Deno.env.get("PORT") ?? "8080");
console.log(`Starting on port ${port}`);
Deno.serve({ port }, app.fetch);
