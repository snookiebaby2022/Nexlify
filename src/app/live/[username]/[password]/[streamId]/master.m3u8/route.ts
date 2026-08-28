import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineByCredentials } from "@/lib/lines";
import { buildAbrMasterPlaylist } from "@/lib/stream-abr-playlist";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { serverBaseUrl } from "@/lib/xtream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multi-bitrate HLS master playlist (XUI ABR ladder). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; streamId: string }> }
) {
  const { username, password, streamId } = await ctx.params;
  const line = await getLineByCredentials(username, password);
  if (!line) return new NextResponse("Unauthorized", { status: 401 });

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, isActive: true },
    include: { provider: true, server: true },
  });
  if (!stream) return new NextResponse("Not found", { status: 404 });

  const primary = resolveStreamPlaybackUrl(stream);
  const baseUrl = serverBaseUrl(req.url, req.headers);
  const body = buildAbrMasterPlaylist(baseUrl, stream.name, primary, stream.bitrates);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store",
    },
  });
}
