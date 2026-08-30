import { db } from "@/db";
import { users, bots } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getRuntimeView } from "@/lib/botManager";
import { getBotEntitlement } from "@/lib/licenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const allBots = await db.select().from(bots);

  const data = await Promise.all(
    allUsers.map(async (u) => {
      const owned = allBots.filter((b) => b.userId === u.id);
      const online = owned.filter(
        (b) => getRuntimeView(b.id).status === "online",
      ).length;
      const entitlement = await getBotEntitlement(u);
      return {
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        role: u.role,
        // Keep botSlots in the response for compatibility with the existing
        // admin UI, but use the license allowance for normal users.
        botSlots: entitlement.slots,
        licenseSlots: entitlement.license?.slots ?? (u.role === "admin" ? u.botSlots : 0),
        hasLicense: entitlement.hasLicense,
        licenseId: entitlement.license?.id ?? null,
        licenseStatus: entitlement.license?.status ?? null,
        botCount: owned.length,
        botsOnline: online,
        isGuest: u.discordId?.startsWith("dev:") ?? false,
        discordId: u.discordId,
        createdAt: u.createdAt,
      };
    }),
  );

  return Response.json({ users: data });
}
