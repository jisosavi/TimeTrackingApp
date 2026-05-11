import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { getMasterDb } from "./lib/db.ts";
import health from "./routes/health.ts";

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

const port = parseInt(Deno.env.get("PORT") ?? "8080");
console.log(`Starting on port ${port}`);
Deno.serve({ port }, app.fetch);
