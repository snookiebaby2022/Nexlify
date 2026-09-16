"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { getAdminSidebarNav, type SidebarNavEntry } from "@/lib/admin-sidebar-nav";
import { sidebarEntryKey } from "@/lib/admin-ui-preferences";
import { adminToast } from "@/lib/admin-toast";
import { getResellerSidebarNav } from "@/lib/reseller-sidebar-nav";
import type { ResellerGroupFlags } from "@/lib/reseller-group-flags";

function entryLabel(entry: SidebarNavEntry): string {
  if (entry.kind === "link") return entry.link.label;
  return entry.group.label;
}

export function SidebarNavCustomizer({
  variant = "admin",
  resellerFlags,
}: {
  variant?: "admin" | "reseller";
  resellerFlags?: Partial<ResellerGroupFlags>;
}) {
  const defaultEntries = useMemo(
    () => (variant === "reseller" ? getResellerSidebarNav(resellerFlags) : getAdminSidebarNav()),
    [variant, resellerFlags]
  );
  const defaultKeys = useMemo(
    () => defaultEntries.map((e) => sidebarEntryKey(e)),
    [defaultEntries]
  );
  const [orderKeys, setOrderKeys] = useState<string[]>(defaultKeys);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [accentColor, setAccentColor] = useState("");
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
        const hidden = d?.preferences?.sidebarHiddenKeys as string[] | undefined;
        if (Array.isArray(hidden)) setHiddenKeys(new Set(hidden));
        const accent = d?.preferences?.sidebarAccentColor;
        if (typeof accent === "string") setAccentColor(accent);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [defaultKeys]);

  const byKey = useMemo(
    () => new Map(defaultEntries.map((e) => [sidebarEntryKey(e), e])),
    [defaultEntries]
  );

  const visibleKeys = useMemo(
    () => orderKeys.filter((k) => !hiddenKeys.has(k)),
    [orderKeys, hiddenKeys]
  );

  const ordered = useMemo(() => {
    return visibleKeys.map((k) => byKey.get(k)).filter(Boolean) as typeof defaultEntries;
  }, [byKey, visibleKeys]);

  const removedKeys = useMemo(
    () => orderKeys.filter((k) => hiddenKeys.has(k)),
    [orderKeys, hiddenKeys]
  );

  const move = (index: number, dir: -1 | 1) => {
    const key = visibleKeys[index];
    if (!key) return;
    const full = [...orderKeys];
    const from = full.indexOf(key);
    const swapKey = visibleKeys[index + dir];
    if (from < 0 || !swapKey) return;
    const to = full.indexOf(swapKey);
    if (to < 0) return;
    [full[from], full[to]] = [full[to], full[from]];
    setOrderKeys(full);
  };

  const onDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromVisible = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isFinite(fromVisible) || fromVisible === index) return;
    const fromKey = visibleKeys[fromVisible];
    const toKey = visibleKeys[index];
    if (!fromKey || !toKey) return;
    const full = [...orderKeys];
    const from = full.indexOf(fromKey);
    const to = full.indexOf(toKey);
    if (from < 0 || to < 0) return;
    full.splice(from, 1);
    full.splice(to, 0, fromKey);
    setOrderKeys(full);
  };

  const hideKey = (key: string) => {
    setHiddenKeys((prev) => new Set(prev).add(key));
  };

  const restoreKey = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ui-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sidebarOrder: orderKeys,
          sidebarHiddenKeys: [...hiddenKeys],
          sidebarAccentColor: accentColor.trim() || "",
        }),
      });
      if (!res.ok) throw new Error("save failed");
      adminToast("Sidebar layout saved for your account.", "success");
      window.dispatchEvent(new CustomEvent("nexlify-sidebar-prefs-updated"));
    } catch {
      adminToast("Could not save sidebar layout.", "error");
    } finally {
      setBusy(false);
    }
  }, [orderKeys, hiddenKeys, accentColor]);

  const reset = () => {
    setOrderKeys(defaultKeys);
    setHiddenKeys(new Set());
    setAccentColor("");
  };

  if (!loaded) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Reorder, hide, or tint the left menu for your login only.
        {variant === "admin"
          ? " To hide links for every admin, use Settings → White-label → Hidden sidebar links."
          : " Reseller group white-label can still hide links for your whole group."}
      </p>

      <div className="space-y-2">
        <label className="text-sm font-medium">Menu accent colour</label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={accentColor || "#22d3ee"}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-10 w-14 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            aria-label="Pick accent colour"
          />
          <input
            type="text"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            placeholder="#22d3ee (optional)"
            className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[140px] bg-transparent font-mono"
            style={{ borderColor: "var(--border)" }}
          />
          {accentColor ? (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setAccentColor("")}
            >
              Clear colour
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Visible menu items</h2>
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
                  className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1"
                  style={{ borderColor: "var(--border)" }}
                  title="Hide from sidebar"
                  onClick={() => hideKey(sidebarEntryKey(entry))}
                >
                  <EyeOff size={12} /> Remove
                </button>
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
                  disabled={index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {removedKeys.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Removed (hidden for you)</h2>
          <ul className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
            {removedKeys.map((key) => {
              const entry = byKey.get(key);
              if (!entry) return null;
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-card)] opacity-80"
                >
                  <span className="flex-1 text-sm">{entryLabel(entry)}</span>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => restoreKey(key)}
                  >
                    <Eye size={12} /> Restore
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--accent)" }}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save layout"}
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm border"
          style={{ borderColor: "var(--border)" }}
          onClick={reset}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
