import { getCurrentUser, isDiscordConfigured } from "@/lib/auth";
import { db } from "@/db";
import { bots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getBotEntitlement, getUserLicense, publicLicense } from "@/lib/licenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({
      user: null,
      discordConfigured: isDiscordConfigured(),
    });
  }
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.userId, user.id));
  const [entitlement, license] = await Promise.all([
    getBotEntitlement(user),
    getUserLicense(user.id),
  ]);

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      botSlots: entitlement.slots,
      botCount: owned.length,
      hasLicense: entitlement.hasLicense,
      license: publicLicense(license),
      isGuest: user.discordId?.startsWith("dev:") ?? false,
    },
    discordConfigured: isDiscordConfigured(),
  });
}
