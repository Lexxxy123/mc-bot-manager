import { db } from "@/db";
import { bots, licenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { publicLicense } from "@/lib/licenses";
import { stopBot } from "@/lib/botManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function stopAssignedBots(userId: string | null) {
  if (!userId) return;
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.userId, userId));
  await Promise.all(
    owned.map(async (bot) => {
      // Revoke/release must also clear the auto-reconnect flag; otherwise the
      // next process restart would try the bot again before the entitlement
      // guard rejects it.
      await db
        .update(bots)
        .set({ enabled: "false" })
        .where(eq(bots.id, bot.id));
      await stopBot(bot.id);
    }),
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const [existing] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.id, id));
  if (!existing) {
    return Response.json({ error: "License not found" }, { status: 404 });
  }

  let body: { slots?: number | string; status?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.slots !== undefined) {
    const slots = Number(body.slots);
    if (!Number.isInteger(slots) || slots < 1 || slots > 1000) {
      return Response.json(
        { error: "Slots must be a whole number between 1 and 1000." },
        { status: 400 },
      );
    }
    updates.slots = Math.floor(slots);
  }

  if (body.status !== undefined) {
    if (!['available', 'active', 'revoked'].includes(body.status)) {
      return Response.json({ error: "Invalid license status" }, { status: 400 });
    }
    if (body.status === "active" && !existing.userId) {
      return Response.json(
        { error: "A license needs an assigned user before it can be active." },
        { status: 400 },
      );
    }
    updates.status = body.status;
    if (body.status === "available") {
      // Releasing a key makes it redeemable by another account.
      updates.userId = null;
      updates.redeemedAt = null;
    }
    if (body.status === "active" && !existing.redeemedAt) {
      updates.redeemedAt = new Date();
    }
  }

  if (Object.keys(updates).length === 1) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(licenses)
    .set(updates)
    .where(eq(licenses.id, id))
    .returning();

  if (
    body.status === "available" ||
    body.status === "revoked"
  ) {
    await stopAssignedBots(existing.userId);
  }

  return Response.json({ ok: true, license: publicLicense(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const [existing] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.id, id));
  if (!existing) {
    return Response.json({ error: "License not found" }, { status: 404 });
  }

  await stopAssignedBots(existing.userId);
  await db.delete(licenses).where(eq(licenses.id, id));
  return Response.json({ ok: true });
}
