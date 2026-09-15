export const HEADER_COLOR_STORAGE_KEY = "nexlify_header_color";
export const HEADER_COLOR_CHANGE_EVENT = "nexlify-header-color";

export const HEADER_COLOR_PRESETS: { id: string; label: string; value: string }[] = [
  { id: "default", label: "Default", value: "" },
  { id: "navy", label: "Navy", value: "#0f172a" },
  { id: "teal", label: "Teal", value: "#0f3d3e" },
  { id: "indigo", label: "Indigo", value: "#1e1b4b" },
  { id: "crimson", label: "Crimson", value: "#3f1d1d" },
  { id: "forest", label: "Forest", value: "#14532d" },
  { id: "slate", label: "Slate", value: "#1e293b" },
  { id: "charcoal", label: "Charcoal", value: "#18181b" },
];

const HEX_RE = /^#([0-9a-f]{6})$/i;

export function normalizeHeaderColor(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const hex = v.startsWith("#") ? v : `#${v}`;
  return HEX_RE.test(hex) ? hex.toLowerCase() : "";
}

function mixHex(hex: string, toward: number, amount: number): string {
  const n = hex.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (toward - c) * amount);
  const to = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function applyHeaderColor(raw: string | null | undefined, fallback?: string | null) {
  if (typeof document === "undefined") return;
  const hex = normalizeHeaderColor(raw) || normalizeHeaderColor(fallback);
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty("--panel-header-bg");
    root.style.removeProperty("--panel-header-border");
    root.removeAttribute("data-header-color");
    return;
  }
  const from = mixHex(hex, 255, 0.06);
  const to = mixHex(hex, 0, 0.18);
  root.style.setProperty(
    "--panel-header-bg",
    `linear-gradient(135deg, ${from} 0%, ${hex} 50%, ${to} 100%)`
  );
  root.style.setProperty("--panel-header-border", `${hex}aa`);
  root.setAttribute("data-header-color", hex);
}

export function readStoredHeaderColor(): string {
  if (typeof localStorage === "undefined") return "";
  return normalizeHeaderColor(localStorage.getItem(HEADER_COLOR_STORAGE_KEY));
}

export function setHeaderColor(raw: string) {
  const hex = normalizeHeaderColor(raw);
  if (typeof localStorage !== "undefined") {
    if (hex) localStorage.setItem(HEADER_COLOR_STORAGE_KEY, hex);
    else localStorage.removeItem(HEADER_COLOR_STORAGE_KEY);
  }
  applyHeaderColor(hex);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HEADER_COLOR_CHANGE_EVENT, { detail: hex }));
  }
}
