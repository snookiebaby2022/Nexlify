"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type TableColumnOption = {
  id: string;
  label: string;
  locked?: boolean;
};

export function useStoredColumnVisibility(
  storageKey: string,
  defaults: Record<string, boolean>
) {
  const [visible, setVisible] = useState<Record<string, boolean>>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (!parsed || typeof parsed !== "object") return;
      setVisible({ ...defaults, ...parsed });
    } catch {
      /* ignore */
    }
    // defaults is a stable literal at each call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function toggle(id: string) {
    setVisible((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function show(id: string) {
    return visible[id] !== false;
  }

  return { visible, toggle, show };
}

export function ToolbarDropdown({
  open,
  onClose,
  trigger,
  children,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="xui-toolbar-dropdown" ref={ref}>
      {trigger}
      {open ? (
        <div
          className={`xui-toolbar-menu ${align === "left" ? "xui-toolbar-menu--left" : ""}`}
          role="menu"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function ColumnPickerList({
  columns,
  show,
  onToggle,
}: {
  columns: TableColumnOption[];
  show: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="xui-toolbar-menu-list">
      <p className="xui-toolbar-menu-title">Columns</p>
      {columns.map((col) => (
        <label key={col.id} className="xui-toolbar-menu-item">
          <input
            type="checkbox"
            checked={show(col.id)}
            disabled={col.locked}
            onChange={() => {
              if (!col.locked) onToggle(col.id);
            }}
          />
          <span>{col.label}</span>
        </label>
      ))}
    </div>
  );
}
