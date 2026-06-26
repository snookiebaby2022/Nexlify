import { access } from "fs/promises";
import { constants } from "fs";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { BIN_PATH_LABELS, type BinPathKey, getBinPaths } from "@/lib/bin-paths";
import { getFfprobePath } from "@/lib/bin-tools";

async function exists(path: string): Promise<boolean> {
  const p = path.trim();
  if (!p) return false;
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const paths = await getBinPaths();
  const checks: { key: string; label: string; path: string; exists: boolean }[] = [];

  for (const key of Object.keys(BIN_PATH_LABELS) as BinPathKey[]) {
    checks.push({
      key,
      label: BIN_PATH_LABELS[key],
      path: paths[key],
      exists: await exists(paths[key]),
    });
  }

  const ffprobePath = await getFfprobePath();
  checks.push({
    key: "ffprobe",
    label: "FFprobe (from active FFmpeg)",
    path: ffprobePath,
    exists: await exists(ffprobePath),
  });

  return NextResponse.json({ checks, host: process.platform });
}
