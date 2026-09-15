"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyDocumentLocale,
  LOCALE_CHANGE_EVENT,
  readStoredLocale,
  t,
  type PanelLocale,
} from "@/lib/i18n/panel-i18n";

export function usePanelI18n() {
  const [locale, setLocale] = useState<PanelLocale>("en");

  useEffect(() => {
    const stored = readStoredLocale();
    setLocale(stored);
    applyDocumentLocale(stored);
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<PanelLocale>).detail;
      if (typeof next === "string") setLocale(next);
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
  }, []);

  const tr = useCallback((key: string) => t(locale, key), [locale]);
  return { locale, t: tr };
}
