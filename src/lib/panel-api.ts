export type PanelKind = "admin" | "reseller";

/** `/admin` or `/reseller` — use for page routes, not API. */
export function panelBasePath(panel: PanelKind): string {
  return panel === "reseller" ? "/reseller" : "/admin";
}

export function linesPagePath(panel: PanelKind, editLineId?: string | null): string {
  const base = `${panelBasePath(panel)}/lines`;
  if (!editLineId?.trim()) return base;
  return `${base}?edit=${encodeURIComponent(editLineId.trim())}`;
}

export function lineActivityPagePath(panel: PanelKind, lineId: string): string {
  return `${panelBasePath(panel)}/line_activity?lineId=${encodeURIComponent(lineId)}`;
}

export function linesApiRoot(panel: PanelKind): string {
  return panel === "reseller" ? "/api/reseller/lines" : "/api/admin/lines";
}

export function ticketsApiRoot(isAdmin: boolean): string {
  return isAdmin ? "/api/admin/tickets" : "/api/reseller/tickets";
}

export function bouquetsApiRoot(panel: PanelKind): string {
  return panel === "reseller" ? "/api/reseller/bouquets" : "/api/admin/bouquets";
}

export function linesMassApiRoot(panel: PanelKind): string {
  return panel === "reseller" ? "/api/reseller/lines/mass" : "/api/admin/lines/mass";
}

/** Resellers are scoped server-side on GET — same route for both panels. */
export function packagesApiRoot(_panel: PanelKind = "admin"): string {
  return "/api/admin/packages";
}
