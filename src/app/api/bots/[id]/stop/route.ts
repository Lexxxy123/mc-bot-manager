import { db } from "@/db";
import { bots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { stopBot } from "@/lib/botManager";
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
  await db.update(bots).set({ enabled: "false" }).where(eq(bots.id, id));
  await stopBot(id);
  return Response.json({ ok: true });
}
