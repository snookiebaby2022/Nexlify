/** Shared panel viewport breakpoints (px). */
export const PANEL_BREAKPOINTS = {
  compactMax: 767,
  tabletMin: 768,
  tabletMax: 1023,
  desktopMin: 1024,
  desktopZoomMin: 1280,
} as const;

export type PanelLayoutMode = "compact" | "tablet" | "desktop";

export const PANEL_LAYOUT_QUERIES = {
  compact: `(max-width: ${PANEL_BREAKPOINTS.compactMax}px)`,
  tablet: `(min-width: ${PANEL_BREAKPOINTS.tabletMin}px) and (max-width: ${PANEL_BREAKPOINTS.tabletMax}px)`,
  desktop: `(min-width: ${PANEL_BREAKPOINTS.desktopMin}px)`,
  /** Legacy: matches tablet + desktop (sidebar visible, no bottom nav). */
  mdUp: `(min-width: ${PANEL_BREAKPOINTS.tabletMin}px)`,
} as const;
