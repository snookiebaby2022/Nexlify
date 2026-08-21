import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { getLineByCredentials } from "@/lib/lines";
import { getDvrRecording } from "@/lib/dvr-service";
import { DvrRecordingStatus } from "@prisma/client";
import { Readable } from "stream";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; password: string; recordingId: string }> }
) {
  const { username, password, recordingId } = await ctx.params;
  const line = await getLineByCredentials(decodeURIComponent(username), decodeURIComponent(password));
  if (!line) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rec = await getDvrRecording(decodeURIComponent(recordingId));
  if (!rec || rec.status !== DvrRecordingStatus.COMPLETED) {
    return NextResponse.json({ error: "Recording not available" }, { status: 404 });
  }
  if (rec.lineId && rec.lineId !== line.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const st = await stat(rec.filePath);
    const stream = createReadStream(rec.filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    const contentType = rec.format === "mp4" ? "video/mp4" : "video/mp2t";
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(st.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
