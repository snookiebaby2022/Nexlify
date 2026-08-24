"use client";

import type { LucideIcon } from "lucide-react";

export type XuiFormTab<T extends string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
};

export function XuiFormTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: XuiFormTab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <nav className="xui-form-tabs" aria-label={ariaLabel ?? "Form sections"}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            className={`xui-form-tab ${isActive ? "xui-form-tab--active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            {Icon ? <Icon size={15} className="xui-form-tab-icon" aria-hidden /> : null}
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
