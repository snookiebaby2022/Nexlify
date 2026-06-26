import type { BinVersionOption } from "@/lib/bin-version-types";
import { NEXLIFY_BIN_ROOT } from "@/lib/bin-paths-layout";

function rootDir(binRoot?: string): string {
  return (binRoot ?? NEXLIFY_BIN_ROOT).replace(/\/+$/, "") || NEXLIFY_BIN_ROOT;
}

const FFMPEG_VERSIONS = [
  "3.0", "3.1", "3.2", "3.3", "3.4",
  "4.0", "4.1", "4.2", "4.3", "4.4", "4.5",
  "5.0", "5.1", "5.2",
  "6.0", "6.1", "6.2", "6.3", "6.4",
  "7.0", "7.1", "7.2", "7.3", "7.4",
  "8.0",
];

const PHP_VERSIONS = ["7.2", "7.3", "7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6"];

/** Full FFmpeg catalog under /home/nexlify/bin/ffmpeg_bin */
export function catalogFfmpegVersions(binRoot?: string): BinVersionOption[] {
  const root = rootDir(binRoot);
  const ffmpegDir = `${root}/ffmpeg_bin`;
  const options: BinVersionOption[] = [
    { id: "bundled-default", label: "Bundled default (ffmpeg_bin/ffmpeg)", path: `${ffmpegDir}/ffmpeg` },
  ];

  for (const ver of FFMPEG_VERSIONS) {
    const slug = ver.replace(".", "");
    options.push({
      id: `bundled-${slug}`,
      label: `FFmpeg ${ver}`,
      path: `${ffmpegDir}/${ver}/ffmpeg`,
    });
    options.push({
      id: `bundled-${slug}-alt`,
      label: `FFmpeg ${ver} (ffmpeg_${slug})`,
      path: `${ffmpegDir}/ffmpeg_${slug}/ffmpeg`,
    });
  }

  const extras: [string, string][] = [
    ["nvenc-61", `${ffmpegDir}/6.1_nvenc/ffmpeg`],
    ["nvenc-60", `${ffmpegDir}/6.0_nvenc/ffmpeg`],
    ["static", `${ffmpegDir}/static/ffmpeg`],
    ["latest", `${ffmpegDir}/latest/ffmpeg`],
  ];
  for (const [id, path] of extras) {
    options.push({ id: `bundled-${id}`, label: `FFmpeg ${id}`, path });
  }

  options.push(
    { id: "system-usr", label: "System /usr/bin/ffmpeg", path: "/usr/bin/ffmpeg" },
    { id: "system-local", label: "System /usr/local/bin/ffmpeg", path: "/usr/local/bin/ffmpeg" },
    { id: "snap-ffmpeg", label: "Snap ffmpeg", path: "/snap/bin/ffmpeg" }
  );

  return options;
}

/** Full PHP catalog under /home/nexlify/bin/php */
export function catalogPhpVersions(binRoot?: string): BinVersionOption[] {
  const root = rootDir(binRoot);
  const phpRoot = `${root}/php`;
  const options: BinVersionOption[] = [
    { id: "bundled-default", label: "Bundled default (php/bin/php)", path: `${phpRoot}/bin/php` },
  ];

  for (const ver of PHP_VERSIONS) {
    const compact = ver.replace(".", "");
    options.push({
      id: `php${compact}`,
      label: `PHP ${ver}`,
      path: `${phpRoot}/${ver}/bin/php`,
    });
    options.push({
      id: `php${compact}-alt`,
      label: `PHP ${ver} (php${compact})`,
      path: `${phpRoot}/php${compact}/bin/php`,
    });
    options.push({
      id: `php${compact}-flat`,
      label: `PHP ${ver} (${phpRoot}/php${compact}/php)`,
      path: `${phpRoot}/php${compact}/php`,
    });
  }

  options.push(
    { id: "system-usr", label: "System /usr/bin/php", path: "/usr/bin/php" },
    { id: "system-php73", label: "System /usr/bin/php7.3", path: "/usr/bin/php7.3" },
    { id: "system-php74", label: "System /usr/bin/php7.4", path: "/usr/bin/php7.4" },
    { id: "system-php80", label: "System /usr/bin/php8.0", path: "/usr/bin/php8.0" },
    { id: "system-php81", label: "System /usr/bin/php8.1", path: "/usr/bin/php8.1" },
    { id: "system-php82", label: "System /usr/bin/php8.2", path: "/usr/bin/php8.2" },
    { id: "system-php83", label: "System /usr/bin/php8.3", path: "/usr/bin/php8.3" },
    { id: "system-php84", label: "System /usr/bin/php8.4", path: "/usr/bin/php8.4" },
    { id: "system-php85", label: "System /usr/bin/php8.5", path: "/usr/bin/php8.5" }
  );

  return options;
}

export function resolveActivePath(
  versions: BinVersionOption[] | undefined,
  activeId: string | undefined,
  fallback: string
): string {
  if (activeId && versions?.length) {
    const hit = versions.find((v) => v.id === activeId);
    if (hit?.path) return hit.path;
  }
  return fallback;
}
