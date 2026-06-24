import { isDiscordConfigured } from "@/lib/auth";
import { publicOrigin } from "@/lib/origin";
import { DISCORD_CLIENT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isDiscordConfigured()) {
    return Response.json(
      { error: "Discord OAuth is not configured" },
      { status: 503 },
    );
  }
  const origin = publicOrigin(req);
  const redirectUri = `${origin}/api/auth/discord/callback`;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    prompt: "consent",
  });

  return Response.redirect(
    `https://discord.com/api/oauth2/authorize?${params.toString()}`,
  );
}
