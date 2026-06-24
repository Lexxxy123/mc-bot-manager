import { getCurrentUser } from "@/lib/auth";
import {
  getTrainingState,
  setTraining,
  setLearnings,
  listConversations,
  clearConversations,
  analyzeAndImprove,
} from "@/lib/training";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const state = await getTrainingState();
  const convos = await listConversations(60);
  return Response.json({
    training: state.training,
    learnings: state.learnings,
    conversations: convos.map((c) => {
      let transcript: { who: string; text: string }[] = [];
      try {
        transcript = JSON.parse(c.transcript);
      } catch {
        transcript = [];
      }
      return {
        id: c.id,
        target: c.target,
        outcome: c.outcome,
        transcript,
        createdAt: c.createdAt,
      };
    }),
  });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { action?: string; value?: boolean; learnings?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  switch (body.action) {
    case "toggle":
      await setTraining(Boolean(body.value));
      return Response.json({ ok: true, training: Boolean(body.value) });
    case "analyze": {
      const result = await analyzeAndImprove();
      return Response.json(result);
    }
    case "save_learnings":
      await setLearnings(String(body.learnings ?? ""));
      return Response.json({ ok: true });
    case "clear":
      await clearConversations();
      return Response.json({ ok: true });
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
