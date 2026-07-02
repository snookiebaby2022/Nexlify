import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup } from "@/lib/panel-settings";
import { NEXLIFY_STACK, type StackComponentStatus } from "@/lib/nexlify-stack";
import { PanelRole } from "@prisma/client";

const execFileAsync = promisify(execFile);

function pathExists(p: string | undefined): boolean {
  if (!p?.trim()) return false;
  try {
    return fs.existsSync(p.trim());
  } catch {
    return false;
  }
}

async function hasNvidiaGpu(): Promise<boolean> {
  try {
    await execFileAsync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [binaries, geo, transcoding] = await Promise.all([
    getSettingGroup("binaries"),
    getSettingGroup("geo"),
    getSettingGroup("transcoding-pack" as never),
  ]);

  const nginxPath = String(binaries.nginxPath ?? NEXLIFY_STACK.nginx.installPath);
  const ffmpegPath = String(binaries.ffmpegPath ?? NEXLIFY_STACK.ffmpeg.defaultPath);
  const geoPath = String(geo.maxmindDbPath || binaries.maxmindPath || NEXLIFY_STACK.geo.defaultDbPath);
  const gpuOk = await hasNvidiaGpu();
  const ffmpegCuda =
    pathExists(NEXLIFY_STACK.ffmpeg.cudaPath) || pathExists(NEXLIFY_STACK.ffmpeg.nvencPath);

  const items: StackComponentStatus[] = [
    {
      id: "nginx",
      label: NEXLIFY_STACK.nginx.label,
      version: pathExists(nginxPath) ? NEXLIFY_STACK.nginx.version : undefined,
      ok: pathExists(nginxPath),
      detail: pathExists(nginxPath)
        ? `${nginxPath} — HTTP/2, HTTP/3, QUIC ready`
        : "Install Nginx 1.29 on stream servers",
      href: "/admin/servers/nginx-config",
    },
    {
      id: "ffmpeg",
      label: NEXLIFY_STACK.ffmpeg.label,
      version: pathExists(ffmpegPath) ? NEXLIFY_STACK.ffmpeg.version : undefined,
      ok: pathExists(ffmpegPath),
      detail: pathExists(ffmpegPath) ? ffmpegPath : "Install FFmpeg 8 under Settings → Binaries",
      href: "/admin/settings/binaries",
    },
    {
      id: "gpu",
      label: "CUDA / NVENC",
      version: gpuOk ? "NVIDIA" : undefined,
      ok: gpuOk && (ffmpegCuda || transcoding.enabled === true),
      detail: gpuOk
        ? ffmpegCuda
          ? "GPU detected — NVENC profiles available"
          : "GPU detected — install FFmpeg 8 CUDA build for NVENC"
        : "No NVIDIA GPU on panel host (OK if transcode runs on stream VPS)",
      href: "/admin/settings/transcoding-pack",
    },
    {
      id: "geo",
      label: "GeoIP",
      ok: geo.enabled !== false && (pathExists(geoPath) || geo.fallbackIpApi !== false),
      detail: pathExists(geoPath)
        ? `MaxMind DB: ${geoPath}`
        : geo.fallbackIpApi !== false
          ? "IP-API fallback active — add MaxMind for offline GeoIP"
          : "Enable GeoIP under Settings → Geo",
      href: "/admin/settings/geo",
    },
  ];

  return NextResponse.json({ items, stack: NEXLIFY_STACK });
}
