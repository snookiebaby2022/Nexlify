"use client";

import { useEffect, useState } from "react";
import {
  applyHeaderColor,
  HEADER_COLOR_CHANGE_EVENT,
  HEADER_COLOR_PRESETS,
  normalizeHeaderColor,
  readStoredHeaderColor,
  setHeaderColor,
} from "@/lib/header-color";
import { usePanelI18n } from "@/lib/i18n/use-panel-i18n";

export function HeaderColorPicker({ fallback = "" }: { fallback?: string }) {
  const { t } = usePanelI18n();
  const [color, setColor] = useState("");

  useEffect(() => {
    const stored = readStoredHeaderColor();
    setColor(stored);
    applyHeaderColor(stored, fallback);
    const onChange = (e: Event) => {
      const next = normalizeHeaderColor((e as CustomEvent<string>).detail);
      setColor(next);
    };
    window.addEventListener(HEADER_COLOR_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(HEADER_COLOR_CHANGE_EVENT, onChange);
  }, [fallback]);

  return (
    <div className="flex items-center gap-1.5" title={t("headerColor")}>
      <input
        type="color"
        aria-label={t("headerColor")}
        className="h-7 w-7 cursor-pointer rounded border bg-transparent p-0"
        style={{ borderColor: "rgba(255,255,255,0.25)" }}
        value={color || "#0f172a"}
        onChange={(e) => setHeaderColor(e.target.value)}
      />
      <select
        aria-label={t("headerColor")}
        className="hidden lg:block rounded border bg-transparent px-1.5 py-1 text-[11px] cursor-pointer"
        style={{ borderColor: "rgba(255,255,255,0.2)", color: "inherit" }}
        value={HEADER_COLOR_PRESETS.some((p) => p.value === color) ? color : color ? "__custom__" : ""}
        onChange={(e) => {
          if (e.target.value === "__custom__") return;
          setHeaderColor(e.target.value);
          if (!e.target.value) applyHeaderColor("", fallback);
        }}
      >
        {HEADER_COLOR_PRESETS.map((p) => (
          <option key={p.id} value={p.value}>
            {p.label}
          </option>
        ))}
        {color && !HEADER_COLOR_PRESETS.some((p) => p.value === color) ? (
          <option value="__custom__">Custom</option>
        ) : null}
      </select>
    </div>
  );
}
