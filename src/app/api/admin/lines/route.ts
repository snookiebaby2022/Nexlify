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
  MIN_LINE_CREDENTIAL_LENGTH,
  sanitizeCredentialInput,
  validateLineCredential,
} from "@/lib/credential-generate";
import { LineStatus, Prisma } from "@prisma/client";
import { normalizeAllowedOutputInput, DEFAULT_ALLOWED_OUTPUT } from "@/lib/line-access-output";
import { UNLIMITED_LINE_DAYS } from "@/lib/line-duration-presets";
import { unlimitedLineExpiresAt } from "@/lib/line-renew";
import { LIVE_STALE_MS } from "@/lib/connections";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const ownerFilter = url.searchParams.get("ownerId")?.trim() ?? "";

  const where: Prisma.LineWhereInput =
    session.role === PanelRole.ADMIN ? {} : { ownerId: session.id };

  if (session.role === PanelRole.ADMIN && ownerFilter) {
    if (ownerFilter === "admin" || ownerFilter === "__none__") {
      where.ownerId = null;
    } else {
      where.ownerId = ownerFilter;
    }
  }

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

  const staleBefore = new Date(Date.now() - LIVE_STALE_MS);

  try {
  const [lines, total] = await Promise.all([
    prisma.line.findMany({
      where,
      include: {
        bouquets: { include: { bouquet: true } },
        owner: { select: { id: true, username: true } },
        lastWatchedStream: { select: { id: true, name: true } },
        _count: { select: { liveConnections: true } },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.line.count({ where }),
  ]);
  const lineIds = lines.map((l) => l.id);
  const activeConnections = lineIds.length
    ? await prisma.liveConnection.findMany({
        where: {
          lastSeenAt: { gte: staleBefore },
          lineId: { in: lineIds },
        },
        select: { lineId: true, ip: true, stream: { select: { name: true } }, userAgent: true, lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
        take: 2000,
      })
    : [];

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
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody<Record<string, unknown>>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const security = await getSettingGroup("security");
  const minLen = Math.max(
    MIN_LINE_CREDENTIAL_LENGTH,
    Number(security.lineCredentialMinLength ?? MIN_LINE_CREDENTIAL_LENGTH) || MIN_LINE_CREDENTIAL_LENGTH
  );
  const autoGen = security.autoGenerateLineCredentials === true;

  let username = sanitizeCredentialInput(String(body.username ?? ""));
  let password = sanitizeCredentialInput(String(body.password ?? ""));
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
    requireLetterAndDigit: security.linePasswordRequireLetterAndDigit === true,
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
    const resolved = await resolveLineCreateFromPackage(
      body as {
        packageId?: string;
        accessCode?: string;
        days?: number;
        maxConnections?: number;
        bouquetIds?: string[];
      },
      { sellerId: session.role === PanelRole.ADMIN ? null : session.id }
    );
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
      if (body.packageId == null || body.packageId === "") {
        const { effectiveCreditCost } = await import("@/lib/package-credits");
        totalCost = effectiveCreditCost(tpl.days, tpl.creditCost, tpl.isTrial);
      }
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
  if (body.unlimited === true) {
    days = UNLIMITED_LINE_DAYS;
    expiresAt = unlimitedLineExpiresAt();
  } else if (body.expiresAt && String(body.expiresAt).trim()) {
    const parsed = new Date(String(body.expiresAt));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }
    expiresAt = parsed;
  } else {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Math.max(1, days));
  }

  const { assertResellerCanCreateLine, assertRoleMaySetUnlimited } = await import(
    "@/lib/reseller-line-guards"
  );
  const unlimitedGuard = assertRoleMaySetUnlimited(session.role, {
    unlimited: body.unlimited === true,
    days,
    expiresAt,
  });
  if (!unlimitedGuard.ok) {
    return NextResponse.json({ error: unlimitedGuard.error }, { status: 400 });
  }

  const { assertIptvTrialAllowed } = await import("@/lib/iptv-trial-lines");
  const trialGuard = await assertIptvTrialAllowed({
    isTrial: Boolean(body.isTrial),
    days: body.unlimited === true ? undefined : days,
    expiresAt: body.unlimited === true ? null : expiresAt,
  });
  if (!trialGuard.ok) {
    return NextResponse.json({ error: trialGuard.error }, { status: 400 });
  }

  const guard = await assertResellerCanCreateLine(session, bouquetIds);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 400 });
  }

  const paysCredits =
    session.role === PanelRole.RESELLER || session.role === PanelRole.SUB_RESELLER;
  if (paysCredits) {
    const { effectiveCreditCost } = await import("@/lib/package-credits");
    totalCost = effectiveCreditCost(days, totalCost, Boolean(body.isTrial));
  }

  if (!bouquetIds.length && session.role !== PanelRole.ADMIN) {
    return NextResponse.json(
      { error: "Select at least one bouquet for this line" },
      { status: 400 }
    );
  }

  const { getResellerLineRewardPercent } = await import("@/lib/reseller-rewards");
  const { debitResellerCredits } = await import("@/lib/reseller-credit-charge");
  const rewardPercent = paysCredits ? await getResellerLineRewardPercent() : 0;

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
      let charged = 0;
      let balanceAfter: number | null = null;
      if (paysCredits && totalCost > 0) {
        const debit = await debitResellerCredits(tx, {
          userId: session.id,
          amount: totalCost,
          note: `Line ${username}`,
        });
        charged = debit.charged;
        balanceAfter = debit.balanceAfter;
        if (rewardPercent > 0) {
          const { applyResellerLineReward } = await import("@/lib/reseller-rewards");
          const rebate = await applyResellerLineReward(tx, {
            userId: session.id,
            spent: totalCost,
            percent: rewardPercent,
            lineUsername: username,
          });
          if (rebate > 0 && balanceAfter != null) balanceAfter += rebate;
        }
      }

      const created = await tx.line.create({
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
          allowedOutput: normalizeAllowedOutputInput(body.allowedOutput) ?? DEFAULT_ALLOWED_OUTPUT,
          bouquets: { create: bouquetIds.map((bouquetId: string) => ({ bouquetId })) },
        },
        include: { bouquets: { include: { bouquet: true } } },
      });
      return { line: created, charged, balanceAfter };
    });

    if (body.accessCode) {
      await incrementAccessCodeUse(String(body.accessCode));
    }

    await logActivity("create_line", {
      userId: session.id,
      lineId: line.line.id,
      entity: "line",
      entityId: line.line.id,
    });

    await invalidateXtreamCategories();

    const panelUrl =
      process.env.NEXT_PUBLIC_SERVER_URL?.trim() ||
      (typeof body.panelUrl === "string" ? body.panelUrl : "") ||
      "";
    if (panelUrl) {
      const { notifyLineWelcome } = await import("@/lib/panel-notification-events");
      void notifyLineWelcome({
        lineId: line.line.id,
        panelUrl,
        clientEmail: body.clientEmail ? String(body.clientEmail) : null,
      });
    }

    return NextResponse.json({
      line: line.line,
      creditsCharged: line.charged,
      creditsRemaining: line.balanceAfter ?? undefined,
    });
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
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
