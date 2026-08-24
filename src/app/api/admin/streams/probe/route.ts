import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { probeStreamUrl } from "@/lib/stream-probe-server";
import { normalizeStreamSource } from "@/lib/stream-source";
import { resolveSourceToStreamUrl, getMediaImportRoot } from "@/lib/import-media";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
function resolveProbeUrl(raw: string): string {
  const normalized = normalizeStreamSource(raw);
  if (!normalized) return "";
  const { streamUrl } = resolveSourceToStreamUrl(normalized, getMediaImportRoot());
  return streamUrl;
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

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
    const { resolveStreamPlaybackUrl } = await import("@/lib/resolve-stream-url");
    url = resolveStreamPlaybackUrl(stream);
    const fast = body.fast === true;
    const probe = await probeStreamUrl(url, { fast });
    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        lastProbeAt: new Date(),
        lastProbeOk: probe.status === "online",
        lastProbeError: probe.status === "online" ? null : probe.message ?? "Probe failed",
      },
    });
    return NextResponse.json({ probe, stream: { name: stream.name, streamUrl: url, isActive: stream.isActive } });
  }

  if (!url) return NextResponse.json({ error: "url or streamId required" }, { status: 400 });

  url = resolveProbeUrl(url) || url;

  const probe = await probeStreamUrl(url, { fast: body.fast === true });
  return NextResponse.json({ probe, stream: { streamUrl: url } });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
