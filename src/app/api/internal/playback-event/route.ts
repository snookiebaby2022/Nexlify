import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-request";
import {
  PLAYBACK_DROP,
  PLAYBACK_ORIGIN_FAIL,
  PLAYBACK_QUALITY_ACTIONS,
  logPlaybackQuality,
} from "@/lib/playback-quality-log";
import { markStreamViewerPlaybackFailed, markStreamSpliceFailed } from "@/lib/viewer-playback-probe";
import { playbackFailKind } from "@/lib/live-playback-contract";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<string>(PLAYBACK_QUALITY_ACTIONS);
const VIEWER_FAIL_ACTIONS = new Set([PLAYBACK_DROP, PLAYBACK_ORIGIN_FAIL]);

export async function POST(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req)) {
    return new NextResponse(null, { status: 403 });
  }

  let body: {
    action?: string;
    streamId?: string;
    lineId?: string;
    detail?: string;
    status?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const action = String(body.action ?? "");
  const streamId = String(body.streamId ?? "").trim();
  if (!streamId || !ACTIONS.has(action)) {
    return new NextResponse("action and streamId required", { status: 400 });
  }

  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { name: true },
  });

  await logPlaybackQuality({
    action: action as (typeof PLAYBACK_QUALITY_ACTIONS)[number],
    streamId,
    streamName: stream?.name,
    lineId: body.lineId,
    detail: body.detail,
    meta: body.status != null ? { status: body.status } : undefined,
  }).catch(() => undefined);

  if (VIEWER_FAIL_ACTIONS.has(action)) {
    const detail =
      body.detail ||
      (body.status != null ? `Viewer playback failed (HTTP ${body.status})` : "Viewer playback failed");
    if (playbackFailKind(detail, body.status) === "splice") {
      void markStreamSpliceFailed(streamId, detail);
    } else {
      void markStreamViewerPlaybackFailed(streamId, detail);
    }
  }

  return new NextResponse(null, { status: 204 });
}
