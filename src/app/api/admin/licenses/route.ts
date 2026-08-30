import crypto from "crypto";
import { db } from "@/db";
import { licenses, users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { publicLicense } from "@/lib/licenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createLicenseKey() {
  return `mc-bots-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  return /^mc-bots-[a-z0-9-]{8,64}$/.test(key) ? key : null;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [rows, allUsers] = await Promise.all([
    db.select().from(licenses).orderBy(desc(licenses.createdAt)),
    db.select({ id: users.id, username: users.username }).from(users),
  ]);
  const names = new Map(allUsers.map((user) => [user.id, user.username]));

  return Response.json({
    licenses: rows.map((license) => ({
      ...publicLicense(license),
      assignedUsername: license.userId
        ? names.get(license.userId) ?? null
        : null,
    })),
  });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { key?: string; slots?: number | string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const rawSlots = body.slots === undefined ? 1 : Number(body.slots);
  if (
    !Number.isInteger(rawSlots) ||
    rawSlots < 1 ||
    rawSlots > 1000
  ) {
    return Response.json(
      { error: "Slots must be a whole number between 1 and 1000." },
      { status: 400 },
    );
  }
  const slots = Math.floor(rawSlots);
  const key = body.key ? normalizeKey(body.key) : createLicenseKey();
  if (!key) {
    return Response.json(
      {
        error:
          "License keys must start with mc-bots- and contain 8–64 letters, numbers, or hyphens after it.",
      },
      { status: 400 },
    );
  }

  try {
    const [created] = await db
      .insert(licenses)
      .values({ key, slots, status: "available" })
      .returning();
    return Response.json(
      { ok: true, license: publicLicense(created) },
      { status: 201 },
    );
  } catch (err) {
    // PostgreSQL's unique violation is the useful case here; don't expose
    // database details for any other insert failure.
    if (String(err).toLowerCase().includes("duplicate")) {
      return Response.json(
        { error: "That license key already exists." },
        { status: 409 },
      );
    }
    return Response.json({ error: "Could not create license." }, { status: 500 });
  }
}
