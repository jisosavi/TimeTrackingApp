import { Hono } from "@hono/hono";

const app = new Hono();

// Railway injects these at runtime; locally they are absent.
const VERSION = {
  commit: Deno.env.get("RAILWAY_GIT_COMMIT_SHA")?.slice(0, 7) ?? "dev",
  branch: Deno.env.get("RAILWAY_GIT_BRANCH") ?? null,
  startedAt: new Date().toISOString(),
};

app.get("/health", (c) => c.json({ status: "ok", ...VERSION }));
app.get("/api/health", (c) => c.json({ status: "ok", ...VERSION }));

export default app;
