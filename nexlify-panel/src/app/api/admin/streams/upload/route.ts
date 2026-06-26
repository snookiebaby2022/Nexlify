import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole, StreamType } from "@prisma/client";
import {
  buildMovieRelativePath,
  buildSeriesRelativePath,
  getMediaImportRoot,
  saveMediaFile,
} from "@/lib/import-media";
import { probeMediaFile } from "@/lib/media-probe";
import path from "path";

const VIDEO_EXT = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".m3u8"]);

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const type = (form.get("type") as string) || "MOVIE";
  const name = String(form.get("name") ?? file.name).trim() || path.basename(file.name, path.extname(file.name));
  const ext = path.extname(file.name).toLowerCase();
  if (!VIDEO_EXT.has(ext)) {
    return NextResponse.json({ error: "Unsupported video extension" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const root = getMediaImportRoot();

  let relativePath: string;
  if (type === StreamType.SERIES) {
    const seriesName = String(form.get("seriesName") ?? name).trim();
    const seasonNum = parseInt(String(form.get("seasonNum") ?? "1"), 10);
    const episodeNum = parseInt(String(form.get("episodeNum") ?? "1"), 10);
    if (!seriesName) {
      return NextResponse.json({ error: "seriesName required for episodes" }, { status: 400 });
    }
    relativePath = buildSeriesRelativePath(seriesName, seasonNum, episodeNum, ext);
  } else {
    relativePath = buildMovieRelativePath(name, ext);
  }

  const saved = await saveMediaFile(buffer, relativePath, root);
  const probe = await probeMediaFile(saved.absolutePath);

  return NextResponse.json({
    streamUrl: saved.streamUrl,
    containerExtension: saved.containerExtension,
    absolutePath: saved.absolutePath,
    probe,
  });
}
