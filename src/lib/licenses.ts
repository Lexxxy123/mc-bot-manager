import { db } from "@/db";
import { licenses, users, type License, type User } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const LICENSE_REQUIRED_MESSAGE =
  "you dont have any slot, you need to have a license to run your bots";

export type LicenseStatus = "available" | "active" | "revoked";

/**
 * Return the most recently updated license assigned to an account. We keep
 * revoked records attached to the account so the user can understand why
 * their access disappeared, while active access is always checked separately.
 */
export async function getUserLicense(userId: string): Promise<License | null> {
  const [license] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.userId, userId))
    .orderBy(desc(licenses.updatedAt), desc(licenses.createdAt))
    .limit(1);
  return license ?? null;
}

export async function getActiveLicense(userId: string): Promise<License | null> {
  const [license] = await db
    .select()
    .from(licenses)
    .where(
      and(eq(licenses.userId, userId), eq(licenses.status, "active")),
    )
    .orderBy(desc(licenses.updatedAt), desc(licenses.createdAt))
    .limit(1);
  return license ?? null;
}

export type BotEntitlement = {
  allowed: boolean;
  hasLicense: boolean;
  slots: number;
  license: License | null;
  isAdmin: boolean;
};

/**
 * License access is the source of truth for normal users. Admins retain the
 * existing user slot setting so the owner cannot accidentally lock themselves
 * out while managing the license catalog.
 */
export async function getBotEntitlement(
  user: Pick<User, "id" | "role" | "botSlots">,
): Promise<BotEntitlement> {
  const isAdmin = user.role === "admin";
  if (isAdmin) {
    return {
      allowed: user.botSlots > 0,
      hasLicense: true,
      slots: Math.max(0, user.botSlots),
      license: null,
      isAdmin: true,
    };
  }

  const license = await getActiveLicense(user.id);
  const slots = Math.max(0, license?.slots ?? 0);
  return {
    allowed: Boolean(license) && slots > 0,
    hasLicense: Boolean(license) && slots > 0,
    slots,
    license,
    isAdmin: false,
  };
}

export async function getBotEntitlementForUserId(
  userId: string,
): Promise<BotEntitlement> {
  const [user] = await db
    .select({ id: users.id, role: users.role, botSlots: users.botSlots })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) {
    return {
      allowed: false,
      hasLicense: false,
      slots: 0,
      license: null,
      isAdmin: false,
    };
  }
  return getBotEntitlement(user);
}

export function publicLicense(license: License | null) {
  if (!license) return null;
  return {
    id: license.id,
    key: license.key,
    slots: license.slots,
    status: license.status as LicenseStatus,
    userId: license.userId,
    redeemedAt: license.redeemedAt,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
  };
}
