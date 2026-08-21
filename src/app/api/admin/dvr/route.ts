import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { PERMS } from "@/lib/staff-permissions";
import {
  cleanupExpiredDvrRecordings,
  createDvrSchedule,
  deleteDvrRecording,
  getDvrSettings,
  getDvrStorageUsage,
  listDvrRecordings,
  listDvrSchedules,
  startDvrRecording,
  stopDvrRecording,
  updateDvrSettings,
} from "@/lib/dvr-service";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

export async function GET(req: NextRequest) {
  const session =
    (await requirePermission(PERMS.DVR_READ)) ??
    (await requireSession([PanelRole.ADMIN]));
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action") ?? "library";
  if (action === "settings") return NextResponse.json(await getDvrSettings());
  if (action === "storage") return NextResponse.json(await getDvrStorageUsage());
  if (action === "schedules") return NextResponse.json(await listDvrSchedules());
  if (action === "library") {
    return NextResponse.json(
      await listDvrRecordings({
        streamId: sp.get("streamId") ?? undefined,
        lineId: sp.get("lineId") ?? undefined,
      })
    );
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const session =
      (await requirePermission(PERMS.DVR_WRITE)) ??
      (await requireSession([PanelRole.ADMIN]));
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const action = String(body.action ?? "");

    if (action === "update-settings") {
      await updateDvrSettings(body.settings ?? {});
      return NextResponse.json({ ok: true });
    }
    if (action === "schedule") {
      const schedule = await createDvrSchedule({
        streamId: String(body.streamId),
        lineId: body.lineId ? String(body.lineId) : null,
        title: body.title ? String(body.title) : undefined,
        startAt: new Date(String(body.startAt)),
        durationMin: Number(body.durationMin ?? 60),
        repeatRule: body.repeatRule ? String(body.repeatRule) : "none",
      });
      return NextResponse.json({ schedule });
    }
    if (action === "start") {
      const stream = await prisma.stream.findUnique({
        where: { id: String(body.streamId) },
        include: { provider: true, server: true },
      });
      if (!stream) return NextResponse.json({ error: "Stream not found" }, { status: 404 });
      const rec = await startDvrRecording({
        streamId: stream.id,
        lineId: body.lineId ? String(body.lineId) : null,
        title: body.title ? String(body.title) : stream.name,
        durationSec: Number(body.durationSec ?? 3600),
        scheduleId: body.scheduleId ? String(body.scheduleId) : null,
        upstreamUrl: resolveStreamPlaybackUrl(stream),
      });
      return NextResponse.json({ recording: rec });
    }
    if (action === "stop") {
      const rec = await stopDvrRecording(String(body.recordingId));
      return NextResponse.json({ recording: rec });
    }
    if (action === "delete") {
      await deleteDvrRecording(String(body.recordingId));
      return NextResponse.json({ ok: true });
    }
    if (action === "cleanup") {
      const cleaned = await cleanupExpiredDvrRecordings();
      return NextResponse.json({ cleaned });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
