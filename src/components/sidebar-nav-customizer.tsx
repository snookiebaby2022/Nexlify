"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { getAdminSidebarNav } from "@/lib/admin-sidebar-nav";
import { sidebarEntryKey } from "@/lib/admin-ui-preferences";
import { orderSidebarEntries } from "@/lib/sidebar-customization";
import { adminToast } from "@/lib/admin-toast";

function entryLabel(
  entry: ReturnType<typeof getAdminSidebarNav>[number]
): string {
  if (entry.kind === "link") return entry.link.label;
  return entry.group.label;
}

export function SidebarNavCustomizer() {
  const defaultEntries = useMemo(() => getAdminSidebarNav(), []);
  const defaultKeys = useMemo(
    () => defaultEntries.map((e) => sidebarEntryKey(e)),
    [defaultEntries]
  );
  const [orderKeys, setOrderKeys] = useState<string[]>(defaultKeys);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ui-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const saved = d?.preferences?.sidebarOrder as string[] | undefined;
        if (saved?.length) {
          const merged = [...saved];
          for (const k of defaultKeys) {
            if (!merged.includes(k)) merged.push(k);
          }
          setOrderKeys(merged);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [defaultKeys]);

  const ordered = useMemo(() => {
    const byKey = new Map(defaultEntries.map((e) => [sidebarEntryKey(e), e]));
    return orderKeys.map((k) => byKey.get(k)).filter(Boolean) as typeof defaultEntries;
  }, [defaultEntries, orderKeys]);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...orderKeys];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setOrderKeys(next);
  };

  const onDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isFinite(from) || from === index) return;
    const next = [...orderKeys];
    const [item] = next.splice(from, 1);
    next.splice(index, 0, item);
    setOrderKeys(next);
  };

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ui-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarOrder: orderKeys }),
      });
      if (!res.ok) throw new Error("save failed");
      adminToast("Sidebar order saved for your account.", "success");
      window.dispatchEvent(new CustomEvent("nexlify-sidebar-prefs-updated"));
    } catch {
      adminToast("Could not save sidebar order.", "error");
    } finally {
      setBusy(false);
    }
  }, [orderKeys]);

  const reset = () => setOrderKeys(defaultKeys);

  if (!loaded) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Drag items or use arrows to reorder the left menu. This applies only to your admin login (not other users).
      </p>
      <ul className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
        {ordered.map((entry, index) => (
          <li
            key={sidebarEntryKey(entry)}
            draggable
            onDragStart={onDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop(index)}
            className="flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-card)]"
          >
            <GripVertical size={16} className="shrink-0 opacity-50 cursor-grab" aria-hidden />
            <span className="flex-1 text-sm font-medium">{entryLabel(entry)}</span>
            <div className="flex gap-1">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: "var(--border)" }}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: "var(--border)" }}
                disabled={index === orderKeys.length - 1}
                onClick={() => move(index, 1)}
              >
                Down
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--accent)" }}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save order"}
        </button>
        <button type="button" className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }} onClick={reset}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
