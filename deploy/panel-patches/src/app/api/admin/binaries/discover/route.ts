import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { discoverFfmpegVersions, discoverPhpVersions } from "@/lib/bin-versions-discover";
import { NEXLIFY_BIN_ROOT } from "@/lib/bin-paths-layout";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [ffmpegVersions, phpVersions] = await Promise.all([
    discoverFfmpegVersions(NEXLIFY_BIN_ROOT),
    discoverPhpVersions(NEXLIFY_BIN_ROOT),
  ]);

  return NextResponse.json({ binRoot: NEXLIFY_BIN_ROOT, ffmpegVersions, phpVersions });
}
