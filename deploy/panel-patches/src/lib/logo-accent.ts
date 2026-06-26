export type LogoAccent = "blue" | "red";

export const LOGO_ACCENT_STORAGE_KEY = "nexlify-logo-accent";

export function getStoredLogoAccent(): LogoAccent {
  if (typeof window === "undefined") return "blue";
  const stored = localStorage.getItem(LOGO_ACCENT_STORAGE_KEY);
  return stored === "red" ? "red" : "blue";
}

export function applyLogoAccent(accent: LogoAccent) {
  document.documentElement.setAttribute("data-logo-accent", accent);
}
