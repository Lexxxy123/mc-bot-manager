// Central config. Reads from environment variables.
// DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are required — the app will
// throw at startup if they are missing so misconfiguration is caught early.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your Railway service variables before deploying.`
    );
  }
  return value;
}

export const DISCORD_CLIENT_ID = requireEnv("DISCORD_CLIENT_ID");

export const DISCORD_CLIENT_SECRET = requireEnv("DISCORD_CLIENT_SECRET");

export const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "mcbm-9f3a1c7e5b2d4806a1e9c0f2b7d6e8a4c3f5091827364554afbecd012345678";

export const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID || "";

// Discord usernames (lowercase, without discriminator) that are always admin.
export const ADMIN_USERNAMES = (
  process.env.ADMIN_USERNAMES || "yumikan10,yumikan"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isDiscordConfigured(): boolean {
  return Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
}
