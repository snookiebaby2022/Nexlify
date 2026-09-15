"use client";

import { PANEL_LOCALES, setPanelLocale } from "@/lib/i18n/panel-i18n";
import { usePanelI18n } from "@/lib/i18n/use-panel-i18n";

export function PanelLanguageSwitcher() {
  const { locale, t } = usePanelI18n();

  return (
    <select
      aria-label={t("language")}
      className="rounded border px-2.5 py-1.5 text-sm bg-transparent cursor-pointer"
      style={{ borderColor: "var(--border)", color: "inherit" }}
      value={locale}
      onChange={(e) => setPanelLocale(e.target.value as typeof locale)}
    >
      {PANEL_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
