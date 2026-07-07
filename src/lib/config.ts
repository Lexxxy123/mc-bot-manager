// Central config. Prefers platform env vars, falls back to provided values so
// the app works even though the sandbox resets .env on each deploy.
// NOTE: for production you should move these into managed env secrets.

export const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || "1519233967344058378";

export const DISCORD_CLIENT_SECRET =
  process.env.DISCORD_CLIENT_SECRET || "Xt7d1zUeVUBMZjmr_9cCkeQvHaeu4mWM";

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
