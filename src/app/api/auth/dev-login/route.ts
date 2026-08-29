import { NextResponse } from "next/server";
import { getOrCreateDevUser, attachSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Instant guest login. Discord OAuth stays available, but it cannot complete
// inside an embedded preview (Discord blocks iframes, previews block new
// tabs), so this path is always enabled.
export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const name = (body.name ?? "").trim() || "guest";
  const user = await getOrCreateDevUser(name);
  const res = NextResponse.json({ ok: true });
  attachSessionCookie(res, user.id);
  return res;
}
