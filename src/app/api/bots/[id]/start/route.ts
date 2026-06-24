import { db } from "@/db";
import { bots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { startBot } from "@/lib/botManager";
import { authorizeBot } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizeBot(id);
  if (!auth.ok) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const [record] = await db.select().from(bots).where(eq(bots.id, id));
  if (!record) {
    return Response.json({ error: "Bot not found" }, { status: 404 });
  }
  await db.update(bots).set({ enabled: "true" }).where(eq(bots.id, id));
  void startBot(record);
  return Response.json({ ok: true });
}
