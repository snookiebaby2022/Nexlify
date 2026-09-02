"use client";

import { useMediaQuery } from "@/lib/use-media-query";
import { PANEL_LAYOUT_QUERIES, type PanelLayoutMode } from "@/lib/panel-breakpoints";

export function usePanelLayout(): {
  mode: PanelLayoutMode;
  isCompact: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Tablet or desktop — sidebar rail, no bottom nav. */
  isMdUp: boolean;
} {
  const isCompact = useMediaQuery(PANEL_LAYOUT_QUERIES.compact);
  const isTablet = useMediaQuery(PANEL_LAYOUT_QUERIES.tablet);
  const isDesktop = useMediaQuery(PANEL_LAYOUT_QUERIES.desktop);

  const mode: PanelLayoutMode = isCompact ? "compact" : isTablet ? "tablet" : "desktop";

  return {
    mode,
    isCompact,
    isTablet,
    isDesktop,
    isMdUp: isTablet || isDesktop,
  };
}
