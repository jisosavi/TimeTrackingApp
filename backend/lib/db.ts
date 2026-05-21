import postgres from "postgres";

const DATABASE_URL = Deno.env.get("PG_URL") || Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) throw new Error("PG_URL or DATABASE_URL is required");
console.log("[db] connecting to:", DATABASE_URL.replace(/:\/\/[^@]+@/, "://***@"));

export const sql = postgres(DATABASE_URL, {
  ssl: "require",
  idle_timeout: 20,
  max_lifetime: 60 * 10,
  connect_timeout: 10,
});
