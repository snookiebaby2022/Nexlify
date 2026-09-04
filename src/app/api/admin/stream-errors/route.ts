import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { cacheGetOrSet } from "@/lib/cache";
import { streamProbeFixHint } from "@/lib/stream-probe-fix-hints";
import { invalidateDashboardStats } from "@/lib/cache-invalidate";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { logActivity } from "@/lib/lines";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await cacheGetOrSet("stream-errors:list", 8, async () => {
    const staleBefore = new Date(Date.now() - 120_000);

    const [probeFails, processErrors] = await Promise.all([
      prisma.stream.findMany({
        where: {
          isActive: true,
          type: "LIVE",
          lastProbeOk: false,
        },
        select: {
          id: true,
          name: true,
          type: true,
          lastProbeAt: true,
          lastProbeError: true,
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
    ]);

    const streams = probeFails.map((s) => {
      const hasBackup = Boolean(s.backupUrl?.trim());
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        lastProbeAt: s.lastProbeAt,
        lastProbeError: s.lastProbeError,
        hasBackup,
        kind: hasBackup ? ("unstable" as const) : ("dead" as const),
        server: s.server,
        fixHint: streamProbeFixHint(s.lastProbeError),
      };
    });

    return {
      counts: {
        dead: streams.filter((s) => s.kind === "dead").length,
        unstable: streams.filter((s) => s.kind === "unstable").length,
        process: processErrors.length,
        total: streams.length,
      },
      streams,
      probeFails: streams,
      processErrors,
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
    if (action !== "clear_live_dashboard_issues") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const [activated, clearedProbes] = await Promise.all([
      prisma.stream.updateMany({
        where: { type: "LIVE", isActive: false },
        data: { isActive: true },
      }),
      prisma.stream.updateMany({
        where: { type: "LIVE", lastProbeOk: false },
        data: { lastProbeOk: true, lastProbeError: null, lastProbeAt: new Date() },
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
