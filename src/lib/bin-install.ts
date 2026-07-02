import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { BinVersionOption } from "@/lib/bin-version-types";
import { catalogFfmpegVersions, catalogPhpVersions } from "@/lib/bin-version-catalog";
import { NEXLIFY_BIN_ROOT } from "@/lib/bin-paths-layout";

const execFileAsync = promisify(execFile);

function parseVersionNum(label: string, id: string): number {
  const fromLabel = label.match(/(\d+)\.(\d+)/);
  if (fromLabel) return Number(fromLabel[1]) * 100 + Number(fromLabel[2]);
  const bundled = id.match(/^bundled-(\d+)/);
  if (bundled) return Number(bundled[1]);
  const php = id.match(/^php(\d+)/);
  if (php) return Number(php[1]);
  return 0;
}

export function latestFfmpegCatalogId(binRoot?: string): string {
  const versions = catalogFfmpegVersions(binRoot).filter((v) => v.id.startsWith("bundled-") && /^\d/.test(v.id.replace("bundled-", "")));
  const sorted = [...versions].sort((a, b) => parseVersionNum(b.label, b.id) - parseVersionNum(a.label, a.id));
  return sorted[0]?.id ?? "bundled-80";
}

export function latestPhpCatalogId(binRoot?: string): string {
  const versions = catalogPhpVersions(binRoot).filter((v) => v.id.startsWith("php") && !v.id.includes("-alt"));
  const sorted = [...versions].sort((a, b) => parseVersionNum(b.label, b.id) - parseVersionNum(a.label, a.id));
  return sorted[0]?.id ?? "php86";
}

function findSystemBinary(tool: "ffmpeg" | "php", hintVersion?: string): string | null {
  const candidates =
    tool === "ffmpeg"
      ? ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg"]
      : [
          "/usr/bin/php",
          "/usr/local/bin/php",
          ...(hintVersion
            ? [
                `/usr/bin/php${hintVersion.replace(".", "")}`,
                `/usr/bin/php${hintVersion}`,
              ]
            : []),
          "/usr/bin/php8.4",
          "/usr/bin/php8.3",
          "/usr/bin/php8.2",
          "/usr/bin/php8.1",
        ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function versionFromOption(option: BinVersionOption): string | undefined {
  const m = option.label.match(/(\d+\.\d+)/);
  return m?.[1];
}

async function tryAptInstall(tool: "ffmpeg" | "php", version?: string): Promise<string | null> {
  if (process.platform !== "linux") return null;
  const pkg =
    tool === "ffmpeg"
      ? "ffmpeg"
      : version
        ? `php${version.replace(".", "")}-cli`
        : "php-cli";
  try {
    await execFileAsync("which", ["apt-get"]);
    await execFileAsync("sudo", ["-n", "apt-get", "install", "-y", pkg], { timeout: 120_000 });
    return findSystemBinary(tool, version);
  } catch {
    try {
      await execFileAsync("apt-get", ["install", "-y", pkg], { timeout: 120_000 });
      return findSystemBinary(tool, version);
    } catch {
      return null;
    }
  }
}

function linkBinary(source: string, target: string, log: string[]): boolean {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(target)) {
    try {
      const st = fs.lstatSync(target);
      if (st.isSymbolicLink() || st.isFile()) fs.unlinkSync(target);
    } catch {
      log.push(`Could not replace existing ${target}`);
      return false;
    }
  }
  fs.symlinkSync(source, target);
  fs.chmodSync(target, 0o755);
  log.push(`Linked ${source} → ${target}`);
  return fs.existsSync(target);
}

export async function installBinVersion(
  option: BinVersionOption,
  tool: "ffmpeg" | "php"
): Promise<{ ok: boolean; log: string[]; path?: string }> {
  const log: string[] = [];
  const ver = versionFromOption(option);
  let source = findSystemBinary(tool, ver);

  if (!source) {
    log.push(`System ${tool} not found; attempting package install…`);
    source = await tryAptInstall(tool, ver);
  }

  if (!source) {
    return {
      ok: false,
      log: [...log, `Install ${tool} on this host (apt install ${tool === "ffmpeg" ? "ffmpeg" : "php-cli"}), then retry.`],
    };
  }

  if (linkBinary(source, option.path, log)) {
    return { ok: true, log, path: option.path };
  }
  return { ok: false, log };
}

export async function installLatestBinary(
  tool: "ffmpeg" | "php",
  binRoot = NEXLIFY_BIN_ROOT
): Promise<{ ok: boolean; log: string[]; versionId?: string; path?: string }> {
  const id = tool === "ffmpeg" ? latestFfmpegCatalogId(binRoot) : latestPhpCatalogId(binRoot);
  const catalog = tool === "ffmpeg" ? catalogFfmpegVersions(binRoot) : catalogPhpVersions(binRoot);
  const option = catalog.find((v) => v.id === id);
  if (!option) return { ok: false, log: [`Unknown catalog id ${id}`] };
  const result = await installBinVersion(option, tool);
  return { ...result, versionId: id };
}
