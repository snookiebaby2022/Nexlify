import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { invalidateXtreamCategories } from "@/lib/cache-invalidate";
import { PanelRole } from "@prisma/client";
import {
  incrementAccessCodeUse,
  resolveLineCreateFromPackage,
} from "@/lib/package-line";
import { getSettingGroup } from "@/lib/panel-settings";
import {
  generateLinePassword,
  generateLineUsername,
  lettersOnly,
  MIN_LINE_CREDENTIAL_LENGTH,
  validateLineCredential,
} from "@/lib/credential-generate";
import { LineStatus, Prisma } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";

  const where: Prisma.LineWhereInput =
    session.role === PanelRole.ADMIN ? {} : { ownerId: session.id };

  if (search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { username: { contains: search, mode: "insensitive" } },
          { password: { contains: search, mode: "insensitive" } },
          { id: { contains: search, mode: "insensitive" } },
          { externalId: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
          { owner: { username: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }

  // Pagination
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
  const skip = (page - 1) * pageSize;
  const sortRaw = (url.searchParams.get("sort") ?? "createdAt").trim();
  const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const orderBy =
    sortRaw === "username"
      ? { username: sortDir as "asc" | "desc" }
      : sortRaw === "expiresAt"
        ? { expiresAt: sortDir as "asc" | "desc" }
        : sortRaw === "owner"
          ? { owner: { username: sortDir as "asc" | "desc" } }
          : sortRaw === "status"
            ? { status: sortDir as "asc" | "desc" }
            : { createdAt: sortDir as "asc" | "desc" };

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);

  try {
  const [lines, total, activeConnections] = await Promise.all([
    prisma.line.findMany({
      where,
      include: {
        bouquets: { include: { bouquet: true } },
        owner: { select: { id: true, username: true } },
        lastWatchedStream: { select: { id: true, name: true } },
        _count: { select: { channelWatches: true, liveConnections: true } },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.line.count({ where }),
    prisma.liveConnection.findMany({
      where: {
        lastSeenAt: { gte: staleBefore },
        line: where,
      },
      select: { lineId: true, ip: true, stream: { select: { name: true } }, userAgent: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
      take: 5000, // Safety limit
    }),
  ]);

  const activeConnByLineId = new Map<string, (typeof activeConnections)[number]>();
  const activeConnCountByLineId = new Map<string, number>();
  for (const conn of activeConnections) {
    if (!activeConnByLineId.has(conn.lineId)) activeConnByLineId.set(conn.lineId, conn);
    activeConnCountByLineId.set(conn.lineId, (activeConnCountByLineId.get(conn.lineId) ?? 0) + 1);
  }

  return NextResponse.json({
    lines: lines.map((line, index) => {
      const active = activeConnByLineId.get(line.id);
      const activeCount = activeConnCountByLineId.get(line.id) ?? 0;
      return {
        ...line,
        displayId: skip + index + 1,
        activeConnectionCount: activeCount,
        activeConnection: active
          ? {
              ip: active.ip,
              streamName: active.stream?.name ?? null,
              userAgent: active.userAgent,
              lastSeenAt: active.lastSeenAt,
            }
          : null,
      };
    }),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to load lines",
        lines: [],
        pagination: { page, pageSize, total: 0, totalPages: 1 },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const security = await getSettingGroup("security");
  const minLen = Math.max(
    MIN_LINE_CREDENTIAL_LENGTH,
    Number(security.lineCredentialMinLength ?? MIN_LINE_CREDENTIAL_LENGTH) || MIN_LINE_CREDENTIAL_LENGTH
  );
  const autoGen = security.autoGenerateLineCredentials === true;

  let username = String(body.username ?? "").trim();
  let password = lettersOnly(String(body.password ?? "").trim());
  // Never replace credentials the operator typed — only fill blanks when auto-generate is on.
  if (!username && autoGen) username = generateLineUsername();
  if (!password && autoGen) password = generateLinePassword();
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required (or enable auto-generate in Settings → Security)" },
      { status: 400 }
    );
  }

  const userErr = validateLineCredential(username, "username", minLen);
  if (userErr) return NextResponse.json({ error: userErr }, { status: 400 });
  const { validateLinePasswordPolicy } = await import("@/lib/credential-generate");
  const passErr = validateLinePasswordPolicy(password, username, {
    minLength: minLen,
    requireLetterAndDigit: false,
    blockCommonPasswords: security.linePasswordBlockCommon !== false,
    disallowUsernameMatch: security.linePasswordDisallowUsername !== false,
  });
  if (passErr) return NextResponse.json({ error: passErr }, { status: 400 });

  const existing = await prisma.line.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: `Username "${username}" is already taken. Choose another.` },
      { status: 400 }
    );
  }

  let maxConnections = Number(body.maxConnections ?? 1);
  let days = Number(body.days ?? 30);
  let bouquetIds: string[] = Array.isArray(body.bouquetIds) ? (body.bouquetIds as string[]) : [];
  let totalCost = 1;

  try {
    const resolved = await resolveLineCreateFromPackage(body as {
      packageId?: string;
      accessCode?: string;
      days?: number;
      maxConnections?: number;
      bouquetIds?: string[];
    });
    days = resolved.days;
    maxConnections = resolved.maxConnections;
    bouquetIds = resolved.bouquetIds;
    totalCost = resolved.creditCost;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }

  if (body.templateId) {
    const { getLineTemplate } = await import("@/lib/line-templates");
    const tpl = getLineTemplate(String(body.templateId));
    if (tpl) {
      // Template fills defaults only — explicit form days/maxConnections win.
      if (body.days == null || body.days === "") days = tpl.days;
      if (body.maxConnections == null || body.maxConnections === "") {
        maxConnections = tpl.maxConnections;
      }
      if (body.packageId == null || body.packageId === "") totalCost = tpl.creditCost;
      body.lockToIp = body.lockToIp ?? tpl.lockToIp;
      body.allowedCountries = body.allowedCountries || tpl.allowedCountries || body.allowedCountries;
      body.blockedCountries = body.blockedCountries || tpl.blockedCountries || body.blockedCountries;
      body.canWatchAdult = body.canWatchAdult ?? tpl.canWatchAdult;
      if (tpl.isTrial && body.isTrial == null) body.isTrial = true;
    }
  }

  // Prefer client-sent days (package/preset) when package resolution didn't override.
  if (body.days != null && body.days !== "" && !body.packageId) {
    days = Math.max(1, Number(body.days) || days);
  }

  // Explicit expiry from the form calendar overrides package days when provided.
  let expiresAt: Date;
  if (body.expiresAt && String(body.expiresAt).trim()) {
    const parsed = new Date(String(body.expiresAt));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }
    expiresAt = parsed;
  } else {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Math.max(1, days));
  }

  const guard = await import("@/lib/reseller-line-guards").then((m) =>
    m.assertResellerCanCreateLine(session, bouquetIds)
  );
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 400 });
  }

  if (!bouquetIds.length && session.role !== PanelRole.ADMIN) {
    return NextResponse.json(
      { error: "Select at least one bouquet for this line" },
      { status: 400 }
    );
  }

  const paysCredits =
    session.role === PanelRole.RESELLER || session.role === PanelRole.SUB_RESELLER;

  const statusRaw = String(body.status ?? "ACTIVE").toUpperCase();
  const status =
    statusRaw === "DISABLED"
      ? LineStatus.DISABLED
      : statusRaw === "BANNED"
        ? LineStatus.BANNED
        : LineStatus.ACTIVE;

  const ownerId =
    session.role === PanelRole.ADMIN
      ? body.ownerId
        ? String(body.ownerId)
        : undefined
      : session.id;

  try {
    const line = await prisma.$transaction(async (tx) => {
      if (paysCredits && totalCost > 0) {
        const owner = await tx.panelUser.findUnique({ where: { id: session.id } });
        if (!owner) throw new Error("Forbidden");
        if (owner.credits < totalCost) throw new Error("Insufficient credits");
        await tx.panelUser.update({
          where: { id: session.id },
          data: { credits: { decrement: totalCost } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: session.id,
            amount: -totalCost,
            balanceAfter: owner.credits - totalCost,
            note: `Line ${username}`,
          },
        });
      }

      return tx.line.create({
        data: {
          username,
          password,
          status,
          maxConnections,
          expiresAt,
          notes: body.notes ? String(body.notes) : null,
          externalId: body.externalId ? String(body.externalId) : undefined,
          ownerId,
          lockToIp: Boolean(body.lockToIp),
          allowedIps: body.allowedIps ? String(body.allowedIps) : null,
          allowedCountries: body.allowedCountries ? String(body.allowedCountries) : null,
          blockedCountries: body.blockedCountries ? String(body.blockedCountries) : null,
          blockedIsps: body.blockedIsps ? String(body.blockedIsps) : null,
          canWatchAdult: body.canWatchAdult === false ? false : true,
          isRestreamer: Boolean(body.isRestreamer),
          isTrial: Boolean(body.isTrial),
          forcedServerId: body.forcedServerId ? String(body.forcedServerId) : null,
          bouquets: { create: bouquetIds.map((bouquetId: string) => ({ bouquetId })) },
        },
        include: { bouquets: { include: { bouquet: true } } },
      });
    });

    if (body.accessCode) {
      await incrementAccessCodeUse(String(body.accessCode));
    }

    await logActivity("create_line", {
      userId: session.id,
      lineId: line.id,
      entity: "line",
      entityId: line.id,
    });

    await invalidateXtreamCategories();

    const panelUrl =
      process.env.NEXT_PUBLIC_SERVER_URL?.trim() ||
      (typeof body.panelUrl === "string" ? body.panelUrl : "") ||
      "";
    if (panelUrl) {
      const { notifyLineWelcome } = await import("@/lib/panel-notification-events");
      void notifyLineWelcome({
        lineId: line.id,
        panelUrl,
        clientEmail: body.clientEmail ? String(body.clientEmail) : null,
      });
    }

    return NextResponse.json({ line });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: `Username "${username}" is already taken. Choose another.` },
        { status: 400 }
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient credits" || msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 400 });
    }
    console.error("[create_line]", e);
    return NextResponse.json({ error: msg || "Failed to create line" }, { status: 500 });
  }
}
