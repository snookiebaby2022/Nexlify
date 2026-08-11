import { NextRequest, NextResponse } from "next/server";
import { requirePanelApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/remote-unlock-ip
 * Unlock IP restrictions on one or more lines.
 * Called by the marketing site admin.
 * Requires the panel API secret (x-panel-api-key or Authorization).
 *
 * Body:
 *   { lineIds?: string[], usernames?: string[], unlockAll?: boolean }
 *
 * - lineIds: unlock specific lines by ID
 * - usernames: unlock specific lines by username
 * - unlockAll: unlock ALL lines on this panel
 */
export async function POST(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { lineIds, usernames, unlockAll } = body as {
    lineIds?: string[];
    usernames?: string[];
    unlockAll?: boolean;
  };

  let where: Record<string, unknown> = {};

  if (unlockAll) {
    where = {};
  } else if (Array.isArray(lineIds) && lineIds.length > 0) {
    where = { id: { in: lineIds } };
  } else if (Array.isArray(usernames) && usernames.length > 0) {
    where = { username: { in: usernames } };
  } else {
    return NextResponse.json(
      { error: "Provide lineIds, usernames, or unlockAll" },
      { status: 400 }
    );
  }

  // Find matching lines
  const lines = await prisma.line.findMany({
    where,
    select: { id: true, username: true, lockToIp: true, allowedIps: true },
  });

  if (lines.length === 0) {
    return NextResponse.json({ error: "No matching lines found", unlocked: 0 });
  }

  // Only unlock lines that actually have IP restrictions
  const lockedLines = lines.filter(
    (l) => l.lockToIp || (l.allowedIps && l.allowedIps.trim())
  );

  if (lockedLines.length === 0) {
    return NextResponse.json({
      ok: true,
      unlocked: 0,
      message: "All matching lines are already unlocked",
    });
  }

  // Unlock them
  const ids = lockedLines.map((l) => l.id);
  await prisma.line.updateMany({
    where: { id: { in: ids } },
    data: {
      lockToIp: false,
      allowedIps: null,
    },
  });

  return NextResponse.json({
    ok: true,
    unlocked: lockedLines.length,
    total: lines.length,
    lines: lockedLines.map((l) => ({
      id: l.id,
      username: l.username,
      wasLocked: l.lockToIp,
      hadIps: Boolean(l.allowedIps?.trim()),
    })),
  });
}

/**
 * GET /api/admin/remote-unlock-ip
 * List lines with IP restrictions on this panel.
 */
export async function GET(req: NextRequest) {
  const ok = await requirePanelApiKey(req);
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lines = await prisma.line.findMany({
    where: {
      OR: [
        { lockToIp: true },
        { allowedIps: { not: null } },
      ],
    },
    select: {
      id: true,
      username: true,
      lockToIp: true,
      allowedIps: true,
      status: true,
    },
    orderBy: { username: "asc" },
  });

  return NextResponse.json({ lines });
}
