import fs from "fs";
import path from "path";
import { access } from "fs/promises";
import { constants } from "fs";
import type { BinVersionOption } from "@/lib/bin-version-types";
import { catalogFfmpegVersions, catalogPhpVersions } from "@/lib/bin-version-catalog";
import { NEXLIFY_BIN_ROOT } from "@/lib/bin-paths-layout";

async function fileOk(p: string): Promise<boolean> {
  try {
    await access(p.trim(), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function uniqByPath(options: BinVersionOption[]): BinVersionOption[] {
  const seen = new Set<string>();
  return options.filter((o) => {
    const k = o.path.trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeRoot(binRoot?: string): string {
  return (binRoot ?? NEXLIFY_BIN_ROOT).replace(/\/+$/, "") || NEXLIFY_BIN_ROOT;
}

/** Discover FFmpeg binaries under Nexlify bin layout and system paths. */
export async function discoverFfmpegVersions(binRoot?: string): Promise<BinVersionOption[]> {
  const root = normalizeRoot(binRoot);
  const options = [...catalogFfmpegVersions(root)];

  const ffmpegDir = path.join(root, "ffmpeg_bin");
  if (fs.existsSync(ffmpegDir)) {
    try {
      for (const ent of fs.readdirSync(ffmpegDir, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const p = path.join(ffmpegDir, ent.name, "ffmpeg");
        options.push({ id: `dir-${ent.name}`, label: `ffmpeg_bin/${ent.name}`, path: p });
      }
    } catch {
      /* ignore */
    }
  }

  const merged = uniqByPath(options);
  for (const o of merged) {
    o.exists = await fileOk(o.path);
  }
  return merged;
}

/** Discover PHP CLI binaries under Nexlify bin layout and system paths. */
export async function discoverPhpVersions(binRoot?: string): Promise<BinVersionOption[]> {
  const root = normalizeRoot(binRoot);
  const options = [...catalogPhpVersions(root)];

  const phpDir = path.join(root, "php");
  if (fs.existsSync(phpDir)) {
    try {
      for (const ent of fs.readdirSync(phpDir, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const candidates = [
          path.join(phpDir, ent.name, "bin", "php"),
          path.join(phpDir, ent.name, "php"),
        ];
        for (const p of candidates) {
          options.push({ id: `php-${ent.name}`, label: `php/${ent.name}`, path: p });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const merged = uniqByPath(options);
  for (const o of merged) {
    o.exists = await fileOk(o.path);
  }
  return merged;
}
