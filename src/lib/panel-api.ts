export type PanelKind = "admin" | "reseller";

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
