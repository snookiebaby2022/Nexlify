/** Parse ffprobe JSON into XUI-style stream media info. */

export type FfprobeMediaInfo = {
  format?: string;
  durationSec?: number;
  bitrateKbps?: number;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  width?: number;
  height?: number;
  fps?: number;
};

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
};

type FfprobeJson = {
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
  };
  streams?: FfprobeStream[];
};

function parseFps(raw?: string): number | undefined {
  if (!raw || raw === "0/0" || raw === "N/A") return undefined;
  const [a, b] = raw.split("/").map((n) => Number(n));
  if (!Number.isFinite(a) || a <= 0) return undefined;
  if (!b || b <= 0) return a;
  const fps = a / b;
  return Number.isFinite(fps) && fps > 0 && fps < 240 ? Math.round(fps * 100) / 100 : undefined;
}

function kbps(raw?: string): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n / 1000);
}

export function parseFfprobeJson(raw: string): FfprobeMediaInfo | null {
  let j: FfprobeJson;
  try {
    j = JSON.parse(raw) as FfprobeJson;
  } catch {
    return null;
  }
  const streams = Array.isArray(j.streams) ? j.streams : [];
  const video = streams.find((s) => s.codec_type === "video" && s.codec_name !== "mjpeg");
  const audio = streams.find((s) => s.codec_type === "audio");
  const width = video?.width && video.width > 0 ? video.width : undefined;
  const height = video?.height && video.height > 0 ? video.height : undefined;
  const bitrateKbps = kbps(j.format?.bit_rate) ?? kbps(video?.bit_rate);
  const durationSec = j.format?.duration ? Number(j.format.duration) : undefined;
  const info: FfprobeMediaInfo = {
    format: j.format?.format_name?.split(",")[0]?.trim() || undefined,
    durationSec: Number.isFinite(durationSec) && (durationSec ?? 0) > 0 ? durationSec : undefined,
    bitrateKbps,
    videoCodec: video?.codec_name || undefined,
    audioCodec: audio?.codec_name || undefined,
    width,
    height,
    resolution: width && height ? `${width}x${height}` : undefined,
    fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
  };
  if (!info.format && !info.videoCodec && !info.audioCodec) return null;
  return info;
}

export function formatFfprobeSummary(info: FfprobeMediaInfo): string {
  const parts: string[] = [];
  if (info.videoCodec) parts.push(info.videoCodec);
  if (info.resolution) parts.push(info.resolution);
  if (info.fps) parts.push(`${info.fps}fps`);
  if (info.audioCodec) parts.push(info.audioCodec);
  if (info.bitrateKbps) parts.push(`${info.bitrateKbps}kbps`);
  if (info.format && parts.length === 0) parts.push(info.format);
  return parts.join(" ");
}
