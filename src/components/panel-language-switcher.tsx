"use client";

import { useEffect, useState } from "react";
import {
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  PANEL_LOCALES,
  type PanelLocale,
} from "@/lib/i18n/panel-i18n";

export function PanelLanguageSwitcher() {
  const [locale, setLocale] = useState<PanelLocale>("en");

  useEffect(() => {
    const stored = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    setLocale(stored);
    document.documentElement.lang = stored;
    document.documentElement.dir = stored === "ar" ? "rtl" : "ltr";
  }, []);

  function change(code: PanelLocale) {
    setLocale(code);
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
    document.documentElement.lang = code;
    document.documentElement.dir = code === "ar" ? "rtl" : "ltr";
    window.dispatchEvent(new CustomEvent("nexlify-locale-change", { detail: code }));
  }

  return (
    <select
      aria-label="Language"
      className="rounded border px-2 py-1 text-xs bg-transparent cursor-pointer"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      value={locale}
      onChange={(e) => change(normalizeLocale(e.target.value))}
    >
      {PANEL_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
