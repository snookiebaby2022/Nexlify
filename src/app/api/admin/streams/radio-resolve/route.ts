import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveRadioPlaybackUrl } from "@/lib/radio-playback";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  let url = String(body.url ?? "").trim();

  if (!url && body.streamId) {
    const stream = await prisma.stream.findUnique({
      where: { id: String(body.streamId) },
      include: { provider: true, server: true },
    });
    if (!stream) return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    url = resolveStreamPlaybackUrl(stream);
  }

  if (!url) return NextResponse.json({ error: "url or streamId required" }, { status: 400 });

  const playbackUrl = await resolveRadioPlaybackUrl(url);
  return NextResponse.json({ playbackUrl, sourceUrl: url });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
