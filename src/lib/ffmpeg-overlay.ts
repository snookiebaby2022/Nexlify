import { getSettingGroup } from "@/lib/panel-settings";

export type OverlayPosition = "tl" | "tr" | "bl" | "br";

export type OverlaySettings = {
  enabled: boolean;
  text: string;
  position: OverlayPosition;
  fontSize: number;
};

/** Strip characters that break FFmpeg drawtext filter graphs. */
export function sanitizeOverlayText(raw: string, maxLen = 64): string {
  return String(raw ?? "")
    .replace(/[\r\n\0]/g, " ")
    .replace(/[':\\]/g, "")
    .replace(/[^\w\s.@#\-]/g, "")
    .trim()
    .slice(0, maxLen);
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

export function drawtextFilter(text: string, position: OverlayPosition, fontSize: number): string {
  const safe = sanitizeOverlayText(text) || "NEXLIFY";
  const size = Number.isFinite(fontSize) ? Math.min(72, Math.max(12, Math.floor(fontSize))) : 22;
  const { x, y } = overlayXy(position);
  return `drawtext=text='${safe}':fontsize=${size}:fontcolor=white@0.85:x=${x}:y=${y}:box=1:boxcolor=black@0.45:boxborderw=8`;
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

/** v4l2 / DirectShow / DeckLink capture URLs → ffmpeg -f … -i … */
export function captureDeviceInputArgs(inputUrl: string): { format: string; device: string } | null {
  const u = String(inputUrl ?? "").trim();
  const v4l = u.match(/^(?:v4l2|video4linux2):\/\/(.+)$/i);
  if (v4l) return { format: "v4l2", device: v4l[1]!.replace(/^\/\//, "") || v4l[1]! };
  const dshow = u.match(/^dshow:\/\/(.+)$/i);
  if (dshow) return { format: "dshow", device: dshow[1]! };
  const deck = u.match(/^decklink:\/\/(.+)$/i);
  if (deck) return { format: "decklink", device: deck[1]! };
  const avf = u.match(/^avfoundation:\/\/(.+)$/i);
  if (avf) return { format: "avfoundation", device: avf[1]! };
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
