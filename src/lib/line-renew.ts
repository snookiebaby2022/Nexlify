import { LineStatus, type Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isUnlimitedLineExpiry } from "./format";
import { UNLIMITED_LINE_DAYS } from "./line-duration-presets";

type Db = Prisma.TransactionClient | typeof prisma;

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
  // Far-future "unlimited" dates must not be the add-from base — that keeps the line unlimited.
  const from = isUnlimitedLineExpiry(currentExpiresAt, now) ? now : currentExpiresAt;
  const baseMs = Math.max(from.getTime(), now.getTime());
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

export function unlimitedLineExpiresAt(now: Date = new Date()): Date {
  return computeExtendedExpiry(now, UNLIMITED_LINE_DAYS, now);
}

export async function applyLineUnlimited(
  lineId: string,
  opts?: { reactivate?: boolean; db?: Db }
): Promise<LineRenewResult> {
  const db = opts?.db ?? prisma;
  const existing = await db.line.findUnique({
    where: { id: lineId },
    select: { id: true, expiresAt: true, status: true },
  });
  if (!existing) throw new Error("Line not found");

  const expiresAt = unlimitedLineExpiresAt();
  const reactivate =
    opts?.reactivate !== false &&
    existing.status !== LineStatus.BANNED &&
    (existing.status === LineStatus.EXPIRED || existing.status === LineStatus.DISABLED);

  const line = await db.line.update({
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
    daysAdded: UNLIMITED_LINE_DAYS,
    status: line.status,
    reactivated: reactivate,
  };
}

export async function applyLineSetExpiry(
  lineId: string,
  expiresAt: Date,
  opts?: { reactivate?: boolean; db?: Db }
): Promise<LineRenewResult> {
  const db = opts?.db ?? prisma;
  const existing = await db.line.findUnique({
    where: { id: lineId },
    select: { id: true, expiresAt: true, status: true },
  });
  if (!existing) throw new Error("Line not found");
  if (Number.isNaN(expiresAt.getTime())) throw new Error("Invalid expiry date");

  const reactivate =
    opts?.reactivate !== false &&
    existing.status !== LineStatus.BANNED &&
    (existing.status === LineStatus.EXPIRED || existing.status === LineStatus.DISABLED);

  const line = await db.line.update({
    where: { id: lineId },
    data: {
      expiresAt,
      ...(reactivate ? { status: LineStatus.ACTIVE } : {}),
    },
    select: { expiresAt: true, status: true },
  });

  const daysAdded = Math.max(
    0,
    Math.round((expiresAt.getTime() - existing.expiresAt.getTime()) / 86400000)
  );

  return {
    expiresAt: line.expiresAt,
    previousExpiresAt: existing.expiresAt,
    daysAdded,
    status: line.status,
    reactivated: reactivate,
  };
}

export async function applyLineRenewDays(
  lineId: string,
  days: number,
  opts?: { reactivate?: boolean; db?: Db }
): Promise<LineRenewResult> {
  const db = opts?.db ?? prisma;
  const existing = await db.line.findUnique({
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

  const line = await db.line.update({
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
