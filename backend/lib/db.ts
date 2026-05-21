import postgres from "postgres";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

export const sql = postgres(DATABASE_URL, {
  ssl: "require",
  idle_timeout: 20,
  max_lifetime: 60 * 10,
  connect_timeout: 10,
});
