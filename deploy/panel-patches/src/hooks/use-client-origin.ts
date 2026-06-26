"use client";

import { useEffect, useState } from "react";

/** Origin safe for SSR — uses env first, then syncs from window after mount */
export function useClientOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") ?? "";
  const [origin, setOrigin] = useState(fromEnv);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return origin;
}
