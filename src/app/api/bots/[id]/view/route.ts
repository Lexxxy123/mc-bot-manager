import { getViewSnapshot, getRuntimeView, getBeamState } from "@/lib/botManager";
import { authorizeBot } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizeBot(id);
  if (!auth.ok) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const view = getRuntimeView(id);
  const snapshot = getViewSnapshot(id);
  const beam = getBeamState(id);
  return Response.json({
    status: view.status,
    snapshot: snapshot ?? { available: false },
    beam,
  });
}
