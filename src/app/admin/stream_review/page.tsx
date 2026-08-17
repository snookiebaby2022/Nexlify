"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  name: string;
  isActive: boolean;
  lastProbeOk: boolean | null;
  lastProbeError: string | null;
  lastProbeAt: string | null;
};

export default function StreamReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/streams?type=LIVE&limit=200&probe=fail");
    const data = await res.json();
    const list = (data.streams ?? data.items ?? []) as Row[];
    setRows(list.filter((s) => s.lastProbeOk === false || !s.isActive));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setActive(id: string, isActive: boolean) {
    setBusy(id);
    try {
      await fetch("/api/admin/streams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Stream review</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Channels that failed the last probe or are disabled. Approve to publish, or keep disabled.
      </p>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">Channel</th>
              <th className="text-left p-3">Probe</th>
              <th className="text-left p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <Link href={`/admin/content/streams?q=${encodeURIComponent(r.name)}`} className="font-medium">
                    {r.name}
                  </Link>
                </td>
                <td className="p-3" style={{ color: "var(--muted)" }}>
                  {r.lastProbeError?.slice(0, 120) || (r.lastProbeOk === false ? "Failed" : "—")}
                </td>
                <td className="p-3">
                  <button
                    disabled={busy === r.id}
                    className="rounded px-3 py-1 text-xs btn-positive"
                    onClick={() => setActive(r.id, !r.isActive)}
                  >
                    {r.isActive ? "Disable" : "Approve"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                  No channels in the review queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
