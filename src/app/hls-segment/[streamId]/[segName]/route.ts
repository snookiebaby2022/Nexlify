import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { hlsDiskRoot } from "@/lib/hls-disk";
import { isPackagerSegmentName } from "@/lib/ts-hls-packager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight segment endpoint - serves HLS segments directly from disk.
 * No auth, no DB queries, no middleware overhead. Just disk read + response.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ streamId: string; segName: string }> }
) {
  const { streamId, segName } = await ctx.params;

  if (!isPackagerSegmentName(segName)) {
    return new NextResponse("Invalid segment", { status: 400 });
  }

  const safeStreamId = streamId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeStreamId || safeStreamId !== streamId) {
    return new NextResponse("Invalid stream", { status: 400 });
  }

  const dir = join(hlsDiskRoot(), safeStreamId);
  const path = join(dir, segName);

  if (!path.startsWith(dir)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    if (!existsSync(path)) {
      return new NextResponse("Segment not found", { status: 404 });
    }
    const buf = readFileSync(path);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Content-Length": String(buf.length),
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Read error", { status: 500 });
  }
}
