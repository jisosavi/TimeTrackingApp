export const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// On Railway the volume is mounted at /app/data; locally set DB_DIR=./data
export const DB_DIR = Deno.env.get("DB_DIR") ?? "./data";
