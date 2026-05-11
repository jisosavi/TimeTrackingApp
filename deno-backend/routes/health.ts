import { Hono } from "@hono/hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/api/health.php", (c) => c.json({ status: "ok" }));

export default app;
