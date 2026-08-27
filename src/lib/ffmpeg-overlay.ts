import { getSettingGroup } from "@/lib/panel-settings";

export type OverlayPosition = "tl" | "tr" | "bl" | "br";

export type OverlaySettings = {
  enabled: boolean;
  text: string;
  position: OverlayPosition;
  fontSize: number;
};

/** Escape for FFmpeg drawtext text='…' after template substitution. */
export function escapeDrawtext(raw: string, maxLen = 64): string {
  return String(raw ?? "")
    .replace(/[\r\n\0]/g, " ")
    .replace(/\\/g, " ")
    .replace(/[:'%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** @deprecated use escapeDrawtext — kept for existing tests. */
export function sanitizeOverlayText(raw: string, maxLen = 64): string {
  return escapeDrawtext(raw, maxLen);
}

export function overlayXy(position: OverlayPosition): { x: string; y: string } {
  switch (position) {
    case "tr":
      return { x: "w-tw-20", y: "20" };
    case "bl":
      return { x: "20", y: "h-th-20" };
    case "br":
      return { x: "w-tw-20", y: "h-th-20" };
    default:
      return { x: "20", y: "20" };
  }
}

function drawtextFontPrefix(): string {
  const fromEnv = String(process.env.NEXLIFY_DRAWTEXT_FONT ?? "").trim();
  if (fromEnv && /^\/[A-Za-z0-9._/\-]+$/.test(fromEnv) && !fromEnv.includes("..")) {
    return `fontfile=${fromEnv}:`;
  }
  return "font=Sans:";
}

export function drawtextFilter(text: string, position: OverlayPosition, fontSize: number): string {
  const safe = escapeDrawtext(text) || "NEXLIFY";
  const size = Number.isFinite(fontSize) ? Math.min(72, Math.max(12, Math.floor(fontSize))) : 22;
  const { x, y } = overlayXy(position);
  return `drawtext=${drawtextFontPrefix()}text='${safe}':fontsize=${size}:fontcolor=white@0.85:x=${x}:y=${y}:box=1:boxcolor=black@0.45:boxborderw=8`;
}

export function resolveOverlayText(template: string, vars: { streamName?: string; panelName?: string }): string {
  return template
    .replace(/\{stream\}/gi, vars.streamName ?? "")
    .replace(/\{panel\}/gi, vars.panelName ?? "Nexlify");
}

/**
 * Burn overlay text into an ffmpeg argv that already has `-i <url>`.
 * Copy-mode pipelines are switched to a light H.264 encode (required for drawtext).
 */
export function applyVideoOverlayFilter(
  args: string[],
  overlay: OverlaySettings,
  vars: { streamName?: string; panelName?: string }
): string[] {
  if (!overlay.enabled) return args;
  const text = resolveOverlayText(overlay.text || "{panel} {stream}", vars);
  const filter = drawtextFilter(text, overlay.position, overlay.fontSize);
  const next = [...args];
  const vfIdx = next.findIndex((a, i) => a === "-vf" && i + 1 < next.length);
  if (vfIdx >= 0) {
    next[vfIdx + 1] = `${next[vfIdx + 1]},${filter}`;
    return forceEncodeIfCopy(next);
  }
  const iIdx = next.findIndex((a) => a === "-i");
  const insertAt = iIdx >= 0 ? iIdx + 2 : 0;
  next.splice(insertAt, 0, "-vf", filter);
  return forceEncodeIfCopy(next);
}

function forceEncodeIfCopy(args: string[]): string[] {
  const copyIdx = args.findIndex((a, i) => a === "-c" && args[i + 1] === "copy");
  if (copyIdx >= 0) {
    args.splice(copyIdx, 2, "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-c:a", "aac");
  }
  const cv = args.findIndex((a, i) => a === "-c:v" && args[i + 1] === "copy");
  if (cv >= 0) {
    args[cv + 1] = "libx264";
    args.splice(cv + 2, 0, "-preset", "veryfast", "-tune", "zerolatency");
  }
  return args;
}

function sanitizeCaptureDevice(format: string, raw: string): string | null {
  const d = String(raw ?? "").trim();
  if (!d || /[\0\n\r;]/.test(d) || d.includes("..")) return null;
  if (format === "v4l2") {
    const path = d.replace(/^\/\//, "");
    return /^\/dev\/video\d{1,3}$/.test(path) ? path : null;
  }
  if (format === "dshow") {
    if (d.includes(":")) return null;
    return /^(video|audio)=[A-Za-z0-9][A-Za-z0-9 _.-]{0,80}$/.test(d) ? d : null;
  }
  if (format === "decklink" || format === "avfoundation") {
    if (d.includes(":")) return null;
    if (/^\d{1,3}$/.test(d)) return d;
    return /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,80}$/.test(d) ? d : null;
  }
  return null;
}

/** v4l2 / DirectShow / DeckLink capture URLs → ffmpeg -f … -i … */
export function captureDeviceInputArgs(inputUrl: string): { format: string; device: string } | null {
  const u = String(inputUrl ?? "").trim();
  const v4l = u.match(/^(?:v4l2|video4linux2):\/\/(.+)$/i);
  if (v4l) {
    const device = sanitizeCaptureDevice("v4l2", v4l[1]!);
    return device ? { format: "v4l2", device } : null;
  }
  const dshow = u.match(/^dshow:\/\/(.+)$/i);
  if (dshow) {
    const device = sanitizeCaptureDevice("dshow", dshow[1]!);
    return device ? { format: "dshow", device } : null;
  }
  const deck = u.match(/^decklink:\/\/(.+)$/i);
  if (deck) {
    const device = sanitizeCaptureDevice("decklink", deck[1]!);
    return device ? { format: "decklink", device } : null;
  }
  const avf = u.match(/^avfoundation:\/\/(.+)$/i);
  if (avf) {
    const device = sanitizeCaptureDevice("avfoundation", avf[1]!);
    return device ? { format: "avfoundation", device } : null;
  }
  return null;
}

export async function getOverlaySettings(): Promise<OverlaySettings> {
  const fp = await getSettingGroup("fingerprint");
  const pos = String(fp.overlayPosition ?? "br");
  return {
    enabled: fp.overlayEnabled === true,
    text: String(fp.overlayText ?? "{panel} {stream}"),
    position: pos === "tl" || pos === "tr" || pos === "bl" || pos === "br" ? pos : "br",
    fontSize: Number(fp.overlayFontSize ?? 22) || 22,
  };
}
