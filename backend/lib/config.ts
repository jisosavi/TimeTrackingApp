export const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
export const SALAXY_API_URL = Deno.env.get("SALAXY_API_URL") ?? "";
export const SALAXY_USERNAME = Deno.env.get("SALAXY_USERNAME") ?? "";
export const SALAXY_PASSWORD = Deno.env.get("SALAXY_PASSWORD") ?? "";
export const SALAXY_TOKEN_URL = Deno.env.get("SALAXY_TOKEN_URL") ?? "https://test-api.salaxy.com/oauth2/token";
