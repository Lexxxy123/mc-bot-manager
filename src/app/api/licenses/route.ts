import { db } from "@/db";
import { licenses, type License } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import {
  getActiveLicense,
  getUserLicense,
  publicLicense,
} from "@/lib/licenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const license = await getUserLicense(user.id);
  const active = await getActiveLicense(user.id);
  return Response.json({
    license: publicLicense(license),
    hasLicense: Boolean(active && active.slots > 0),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = (body.key ?? "").trim().toLowerCase();
  if (!/^mc-bots-[a-z0-9-]{8,64}$/.test(key)) {
    return Response.json(
      {
        error:
          "Enter a valid license key, for example mc-bots-akdkkakfall.",
      },
      { status: 400 },
    );
  }

  const existing = await getActiveLicense(user.id);
  if (existing) {
    return Response.json(
      {
        error:
          "You already have an active license. Ask an admin to release it before redeeming another.",
      },
      { status: 409 },
    );
  }

  // Claim the key atomically. This prevents two accounts from redeeming the
  // same available key if both submit it at the same time.
  let claimed: License | undefined;
  try {
    [claimed] = await db
      .update(licenses)
      .set({
        userId: user.id,
        status: "active",
        redeemedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(licenses.key, key),
          eq(licenses.status, "available"),
          isNull(licenses.userId),
        ),
      )
      .returning();
  } catch (err) {
    // The partial unique index protects against two redemption requests for
    // different keys racing for the same account.
    if (String(err).toLowerCase().includes("duplicate")) {
      return Response.json(
        {
          error:
            "You already have an active license. Ask an admin to release it before redeeming another.",
        },
        { status: 409 },
      );
    }
    return Response.json({ error: "Could not redeem that license." }, { status: 500 });
  }

  if (!claimed) {
    const [found] = await db
      .select({ status: licenses.status, userId: licenses.userId })
      .from(licenses)
      .where(eq(licenses.key, key))
      .limit(1);

    return Response.json(
      {
        error: found
          ? found.userId === user.id
            ? "This license is not available right now. Ask an admin to release it."
            : "That license has already been redeemed or revoked."
          : "License key not found.",
      },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, license: publicLicense(claimed) });
}
