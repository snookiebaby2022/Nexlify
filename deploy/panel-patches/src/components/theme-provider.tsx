"use client";

import { useEffect } from "react";
import { applyLogoAccent, getStoredLogoAccent } from "@/lib/logo-accent";

const STORAGE_KEY = "nexlify-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    applyLogoAccent(getStoredLogoAccent());
  }, []);

  return <>{children}</>;
}
