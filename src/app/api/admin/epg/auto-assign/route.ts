import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, StreamType } from "@prisma/client";
import { autoAssignEpgToStream, findBestEpgMatch, listEpgChannelCandidates } from "@/lib/epg-auto-match";

import { apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
/**
 * POST { streamId?, name?, channelId?, force? }
 * Auto-match EPG from loaded guide channels (provider/XMLTV imports).
 */
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const streamId = String(body.streamId ?? "").trim();
  const force = body.force === true;
  const nameHint = String(body.name ?? "").trim();
  const channelIdHint = body.channelId != null ? String(body.channelId) : null;

  if (streamId) {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        name: true,
        type: true,
        channelId: true,
        epgChannelId: true,
      },
    });
    if (!stream) return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    if (stream.type !== StreamType.LIVE) {
      return NextResponse.json({ error: "Auto EPG is for live channels" }, { status: 400 });
    }
    const match = await autoAssignEpgToStream({
      streamId: stream.id,
      name: nameHint || stream.name,
      channelId: channelIdHint || stream.channelId,
      epgChannelId: stream.epgChannelId,
      forceRematch: force,
    });
    if (!match) {
      return NextResponse.json({
        ok: false,
        error: "No EPG match found — import an EPG source first (Admin → EPG).",
      });
    }
    return NextResponse.json({ ok: true, match });
  }

  // Preview match without saving (for Add Stream form)
  if (!nameHint) {
    return NextResponse.json({ error: "streamId or name required" }, { status: 400 });
  }
  const channels = await listEpgChannelCandidates();
  if (!channels.length) {
    return NextResponse.json({
      ok: false,
      error: "No EPG channels loaded — sync an EPG source first.",
    });
  }
  const match = findBestEpgMatch(nameHint, channels, { channelId: channelIdHint });
  if (!match) {
    return NextResponse.json({ ok: false, error: "No close EPG match for this name." });
  }
  return NextResponse.json({ ok: true, match });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
