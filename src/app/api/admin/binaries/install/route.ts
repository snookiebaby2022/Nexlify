import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { catalogFfmpegVersions, catalogPhpVersions } from "@/lib/bin-version-catalog";
import { installBinVersion, installLatestBinary } from "@/lib/bin-install";
import { NEXLIFY_BIN_ROOT } from "@/lib/bin-paths-layout";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const tool = body.tool === "php" ? "php" : "ffmpeg";
  const binRoot = String(body.binRoot ?? NEXLIFY_BIN_ROOT);
  const installLatest = Boolean(body.installLatest);
  const versionId = body.versionId ? String(body.versionId) : "";

  if (installLatest) {
    const result = await installLatestBinary(tool, binRoot);
    return NextResponse.json(result);
  }

  const catalog = tool === "ffmpeg" ? catalogFfmpegVersions(binRoot) : catalogPhpVersions(binRoot);
  const option = catalog.find((v) => v.id === versionId);
  if (!option) {
    return NextResponse.json({ error: "Unknown version id" }, { status: 400 });
  }

  const result = await installBinVersion(option, tool);
  return NextResponse.json(result);
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
