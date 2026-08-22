import { LineStatus } from "@prisma/client";
import { prisma } from "./prisma";

export type LineRenewResult = {
  expiresAt: Date;
  previousExpiresAt: Date;
  daysAdded: number;
  status: LineStatus;
  reactivated: boolean;
};

/** Extend from max(current expiry, now) using UTC calendar days. */
export function computeExtendedExpiry(
  currentExpiresAt: Date,
  days: number,
  now: Date = new Date()
): Date {
  const add = Math.floor(Number(days));
  if (!Number.isFinite(add) || add <= 0) {
    throw new Error("Days must be a positive number");
  }
  const baseMs = Math.max(currentExpiresAt.getTime(), now.getTime());
  const next = new Date(baseMs);
  next.setUTCDate(next.getUTCDate() + add);
  return next;
}

export function previewExtendedExpiry(
  currentExpiresAt: string | Date,
  days: number,
  now: Date = new Date()
): Date {
  const current = currentExpiresAt instanceof Date ? currentExpiresAt : new Date(currentExpiresAt);
  if (Number.isNaN(current.getTime())) return computeExtendedExpiry(now, days, now);
  return computeExtendedExpiry(current, days, now);
}

export async function applyLineRenewDays(
  lineId: string,
  days: number,
  opts?: { reactivate?: boolean }
): Promise<LineRenewResult> {
  const existing = await prisma.line.findUnique({
    where: { id: lineId },
    select: { id: true, expiresAt: true, status: true },
  });
  if (!existing) throw new Error("Line not found");

  const daysAdded = Math.floor(Number(days));
  if (!Number.isFinite(daysAdded) || daysAdded <= 0) {
    throw new Error("Days must be a positive number");
  }

  const expiresAt = computeExtendedExpiry(existing.expiresAt, daysAdded);
  const reactivate =
    opts?.reactivate !== false &&
    existing.status !== LineStatus.BANNED &&
    (existing.status === LineStatus.EXPIRED || existing.status === LineStatus.DISABLED);

  const line = await prisma.line.update({
    where: { id: lineId },
    data: {
      expiresAt,
      ...(reactivate ? { status: LineStatus.ACTIVE } : {}),
    },
    select: { expiresAt: true, status: true },
  });

  return {
    expiresAt: line.expiresAt,
    previousExpiresAt: existing.expiresAt,
    daysAdded,
    status: line.status,
    reactivated: reactivate,
  };
}
