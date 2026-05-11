import { Hono } from "@hono/hono";

const app = new Hono();

app.all("/api/logout.php", (c) => c.json({ success: true }));

export default app;
