import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { cacheGetOrSet } from "@/lib/cache";
import { liveOriginOrSpliceFailWhere } from "@/lib/stream-health-fail";
import { streamProbeFixHint } from "@/lib/stream-probe-fix-hints";
import { invalidateDashboardStats } from "@/lib/cache-invalidate";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { logActivity } from "@/lib/lines";
import {
  PLAYBACK_ISSUE_ACTIONS,
  parseStreamErrorsPlaybackHours,
  playbackSinceFromHours,
} from "@/lib/stream-errors-playback";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const playbackHours = parseStreamErrorsPlaybackHours(req.nextUrl.searchParams.get("hours"));
  const cacheKey = `stream-errors:list:${playbackHours}`;

  const payload = await cacheGetOrSet(cacheKey, 8, async () => {
    const staleBefore = new Date(Date.now() - 120_000);

    const playbackSince = playbackSinceFromHours(playbackHours);

    const [probeFails, processErrors, playbackIssues] = await Promise.all([
      prisma.stream.findMany({
        where: liveOriginOrSpliceFailWhere(),
        select: {
          id: true,
          name: true,
          type: true,
          lastProbeAt: true,
          lastProbeError: true,
          lastSpliceError: true,
          backupUrl: true,
          server: { select: { name: true } },
        },
        take: 200,
        orderBy: { lastProbeAt: "desc" },
      }),
      prisma.streamProcess.findMany({
        where: {
          OR: [
            { status: "error" },
            { errorMessage: { not: null } },
            { status: "restarting" },
            { lastSeenAt: { lt: staleBefore }, status: { in: ["running", "unknown"] } },
          ],
        },
        include: {
          stream: { select: { id: true, name: true } },
          server: { select: { id: true, name: true } },
        },
        take: 50,
        orderBy: { lastSeenAt: "desc" },
      }),
      prisma.activityLog.findMany({
        where: {
          createdAt: { gte: playbackSince },
          action: { in: [...PLAYBACK_ISSUE_ACTIONS] },
        },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: {
          line: { select: { username: true } },
        },
      }),
    ]);

    const streams = probeFails.map((s) => {
      const hasBackup = Boolean(s.backupUrl?.trim());
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        lastProbeAt: s.lastProbeAt,
        lastProbeError: s.lastProbeError || s.lastSpliceError,
        hasBackup,
        kind: hasBackup ? ("unstable" as const) : ("dead" as const),
        server: s.server,
        fixHint: streamProbeFixHint(s.lastProbeError || s.lastSpliceError),
      };
    });

    const playback = playbackIssues.map((row) => {
      const meta =
        row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
      return {
        id: row.id,
        action: row.action,
        createdAt: row.createdAt,
        lineUsername: row.line?.username ?? (meta.lineUsername as string | undefined) ?? null,
        streamName: (meta.streamName as string | undefined) ?? (meta.name as string | undefined) ?? null,
        streamId: row.entityId ?? (meta.streamId as string | undefined) ?? null,
        detail: (meta.error as string | undefined) ?? (meta.detail as string | undefined) ?? null,
        status: meta.status != null ? Number(meta.status) : null,
      };
    });

    return {
      counts: {
        dead: streams.filter((s) => s.kind === "dead").length,
        unstable: streams.filter((s) => s.kind === "unstable").length,
        process: processErrors.length,
        playback: playback.length,
        total: streams.length,
      },
      streams,
      probeFails: streams,
      processErrors,
      playbackIssues: playback,
      playbackHours,
    };
  });

  return NextResponse.json(payload);
}

/** Activate inactive LIVE and drop leftover lastProbeOk=false rows from the dashboard. */
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const action = String(parsed.data.action ?? "");

    if (action === "clear_playback_logs") {
      const hours = parseStreamErrorsPlaybackHours(
        parsed.data.hours != null ? String(parsed.data.hours) : null
      );
      const since = playbackSinceFromHours(hours);
      const deleted = await prisma.activityLog.deleteMany({
        where: {
          createdAt: { gte: since },
          action: { in: [...PLAYBACK_ISSUE_ACTIONS] },
        },
      });
      await logActivity("clear_playback_logs", {
        userId: session.id,
        entity: "stream",
        meta: { hours, deleted: deleted.count },
      });
      return NextResponse.json({ ok: true, deleted: deleted.count, hours });
    }

    if (action !== "clear_live_dashboard_issues") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const [activated, clearedProbes] = await Promise.all([
      prisma.stream.updateMany({
        where: { type: "LIVE", isActive: false },
        data: { isActive: true },
      }),
      prisma.stream.updateMany({
        where: {
          type: "LIVE",
          OR: [{ lastProbeOk: false }, { lastSpliceOk: false }],
        },
        data: {
          lastProbeOk: true,
          lastProbeError: null,
          lastProbeAt: new Date(),
          lastSpliceOk: true,
          lastSpliceError: null,
          lastSpliceAt: new Date(),
        },
      }),
    ]);

    await logActivity("clear_live_dashboard_issues", {
      userId: session.id,
      entity: "stream",
      meta: { activated: activated.count, clearedProbes: clearedProbes.count },
    });
    await invalidateDashboardStats().catch(() => {});

    return NextResponse.json({
      ok: true,
      activated: activated.count,
      clearedProbes: clearedProbes.count,
    });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
