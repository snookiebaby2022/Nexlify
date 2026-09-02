"use client";

import { useEffect, useState } from "react";
import { PANEL_LAYOUT_QUERIES } from "@/lib/panel-breakpoints";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

/** @deprecated Prefer usePanelLayout() for layout mode. */
export function useIsMdUp() {
  return useMediaQuery(PANEL_LAYOUT_QUERIES.mdUp);
}
