/** Built-in offline splash screens for IPTV apps (Nexus, Smarters, etc.). */
export type OfflineStreamImageTemplate = {
  id: string;
  label: string;
  /** Path under panel origin, e.g. /offline-templates/signal.svg */
  path: string;
};

export const OFFLINE_STREAM_IMAGE_TEMPLATES: OfflineStreamImageTemplate[] = [
  { id: "signal", label: "No signal (classic)", path: "/offline-templates/signal.svg" },
  { id: "offline", label: "Stream offline", path: "/offline-templates/offline.svg" },
  { id: "maintenance", label: "Maintenance", path: "/offline-templates/maintenance.svg" },
  { id: "sports", label: "Sports break", path: "/offline-templates/sports.svg" },
];

export function resolveOfflineStreamImageUrl(opts: {
  panelOrigin: string;
  customUrl?: string | null;
  templateId?: string | null;
}): string {
  const custom = String(opts.customUrl ?? "").trim();
  if (custom) return custom;
  const tplId = String(opts.templateId ?? "offline").trim() || "offline";
  const tpl =
    OFFLINE_STREAM_IMAGE_TEMPLATES.find((t) => t.id === tplId) ??
    OFFLINE_STREAM_IMAGE_TEMPLATES.find((t) => t.id === "offline")!;
  const origin = opts.panelOrigin.replace(/\/+$/, "");
  return `${origin}${tpl.path}`;
}
