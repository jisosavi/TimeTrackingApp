import postgres from "postgres";

const DATABASE_URL = Deno.env.get("PG_URL") || Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) throw new Error("PG_URL or DATABASE_URL is required");
console.log("[db] raw url:", DATABASE_URL.replace(/:\/\/[^@]+@/, "://***@"));
const isInternal = DATABASE_URL.includes(".railway.internal");
try {
  const u = new URL(DATABASE_URL);
  console.log("[db] parsed host:", u.hostname, "port:", u.port || "5432");
} catch (e) {
  console.error("[db] URL parse failed:", e);
}

export const sql = postgres(DATABASE_URL, {
  ssl: isInternal ? false : "require",
  idle_timeout: 20,
  max_lifetime: 60 * 10,
  connect_timeout: 10,
});
