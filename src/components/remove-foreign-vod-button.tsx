"use client";

import { useState } from "react";
import type { ForeignVodItem } from "@/lib/foreign-vod";

export function RemoveForeignVodButton({
  kind,
  onDone,
  className,
}: {
  kind: "MOVIE" | "SERIES";
  onDone?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ForeignVodItem[]>([]);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const label = kind === "SERIES" ? "TV series" : "movies";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function scan() {
    setBusy(true);
    try {
      const peek = await fetch(`/api/admin/tools/remove-foreign-vod?type=${kind}`, {
        cache: "no-store",
      });
      const data = (await peek.json().catch(() => ({}))) as {
        count?: number;
        items?: ForeignVodItem[];
        error?: string;
      };
      if (!peek.ok) {
        alert(data.error ?? "Could not scan titles");
        return;
      }
      const list = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.count ?? list.length);
      if (!total) {
        alert(`No non-English ${label} found.`);
        return;
      }
      setCount(total);
      setItems(list);
      setSelected(new Set(list.filter((item) => item.confidence !== "low").map((item) => item.id)));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!selected.size) {
      alert("Select at least one title to delete.");
      return;
    }
    if (
      !confirm(
        `Delete ${selected.size} selected ${label}? English titles stay. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tools/remove-foreign-vod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, ids: [...selected] }),
      });
      const result = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) {
        alert(result.error ?? "Delete failed");
        return;
      }
      alert(`Removed ${result.deleted ?? selected.size} ${label}.`);
      setOpen(false);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  const lowCount = items.filter((item) => item.confidence === "low").length;

  return (
    <>
      <button
        type="button"
        className={className ?? "xui-streams-btn xui-streams-btn--ghost"}
        disabled={busy}
        onClick={() => void scan()}
        title={`Preview and delete ${label} that are not English`}
      >
        {busy && !open ? "Scanning…" : `Remove foreign ${label}`}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border flex flex-col"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-semibold">Review foreign {label}</h2>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {count.toLocaleString()} flagged
                {items.length < count ? ` (showing first ${items.length})` : ""}. Uncheck English titles
                sitting in a foreign folder — they stay selected off by default.
                {lowCount ? ` ${lowCount} likely English.` : ""}
              </p>
            </div>
            <div className="overflow-auto px-4 py-2 space-y-1 text-sm">
              {items.map((item) => (
                <label key={item.id} className="flex items-start gap-2 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{item.name}</span>
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {item.categoryName || "Uncategorized"} · {item.language}
                      {item.reason === "category" ? " · flagged by folder name" : ""}
                      {item.confidence === "low" ? " · likely English" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="px-4 py-3 border-t flex flex-wrap gap-2 justify-end" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setSelected(new Set(items.map((item) => item.id)))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setSelected(new Set())}
              >
                Select none
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border"
                style={{ borderColor: "var(--border)" }}
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded text-white disabled:opacity-50"
                style={{ background: "var(--danger, #dd4b39)" }}
                disabled={busy || !selected.size}
                onClick={() => void confirmDelete()}
              >
                {busy ? "Deleting…" : `Delete ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
