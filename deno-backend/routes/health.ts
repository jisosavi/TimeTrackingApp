import { Hono } from "@hono/hono";

const app = new Hono();

app.get("/api/health.php", (c) => c.json({ status: "ok" }));

export default app;
