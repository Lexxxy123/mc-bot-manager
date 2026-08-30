import {
  selectHotbarSlot,
  activateHeldItem,
  dropHeldItem,
  startBeam,
  stopBeam,
  moveBot,
  clickWindowSlot,
  closeWindow,
} from "@/lib/botManager";
import { authorizeBot } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizeBot(id);
  if (!auth.ok) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { action?: string; slot?: number; dir?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  let result;
  switch (action) {
    case "select":
      result = await selectHotbarSlot(id, Number(body.slot ?? 0));
      break;
    case "use":
      result = await activateHeldItem(id);
      break;
    case "drop":
      result = await dropHeldItem(id);
      break;
    case "move":
      result = await moveBot(id, body.dir ?? "forward");
      break;
    case "clickWindow":
      result = await clickWindowSlot(id, Number(body.slot ?? 0));
      break;
    case "closeWindow":
      result = await closeWindow(id);
      break;
    case "beam":
    case "beam_start":
      result = await startBeam(id);
      break;
    case "beam_stop":
      result = await stopBeam(id);
      break;
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 409 });
  }
  return Response.json({ ok: true, message: result.message });
}
