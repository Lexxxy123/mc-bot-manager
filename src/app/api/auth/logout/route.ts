import { NextResponse } from "next/server";
import { attachClearCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  attachClearCookie(res);
  return res;
}
