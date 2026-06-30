"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LINE_ENIGMA_FORMATS, LINE_PLAYLIST_FORMAT_GROUPS, buildLinePlaylistUrl } from "@/lib/line-playlist-urls";

type Line = { id: string; username: string; password: string; isActive: boolean };

export default function EnigmaBouquetToolsPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [lineId, setLineId] = useState("");
  const [host, setHost] = useState("");

  useEffect(() => {
    setHost(window.location.host);
    fetch("/api/admin/lines?limit=500")
      .then((r) => r.json())
      .then((d) => {
        const list: Line[] = (d.lines ?? d ?? []).filter((l: Line) => l.isActive !== false);
        setLines(list);
        if (list[0]) setLineId(list[0].id);
      });
  }, []);

  const line = useMemo(() => lines.find((l) => l.id === lineId), [lines, lineId]);
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "https:" : "http:";

  const scripts = useMemo(() => {
    if (!line) return [];
    return LINE_ENIGMA_FORMATS.map((f) => ({
      format: f,
      url: buildLinePlaylistUrl(host, proto, line.username, line.password, f),
    }));
  }, [line, host, proto]);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enigma2 bouquet generation</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Strong native Enigma2 support — auto Python scripts (P2/P3), simple bouquet updates, OE 1.6 / 2.0. HLS recommended for stability.
          </p>
        </div>
        <Link href="/admin/enigmas" className="text-sm link-back">
          ← Enigma2 devices
        </Link>
      </div>

      <div className="rounded-lg border p-4 grid sm:grid-cols-2 gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <label className="text-sm block">
          Preview line
          <select
            className="mt-1 w-full rounded border px-2 py-1.5 panel-select bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.username}</option>
            ))}
          </select>
        </label>
        <label className="text-sm block">
          Panel host
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 bg-transparent text-sm font-mono"
            style={{ borderColor: "var(--border)" }}
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </label>
      </div>

      {LINE_PLAYLIST_FORMAT_GROUPS.filter((g) => g.id.startsWith("enigma")).map((group) => (
        <div key={group.id} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="px-4 py-2 text-sm font-semibold" style={{ background: "var(--bg-card)" }}>{group.label}</div>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {group.formats.map((f) => {
              const row = scripts.find((s) => s.format.type === f.type);
              return (
                <li key={f.type} className="px-4 py-3 text-sm flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{f.label}</p>
                    {f.description && <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{f.description}</p>}
                  </div>
                  {row && (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Download script
                      </a>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => navigator.clipboard.writeText(row.url)}
                      >
                        Copy URL
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="rounded-lg border p-4 text-sm space-y-2" style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}>
        <p className="font-medium">Dreambox / Enigma2 setup</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
          <li>Add device under Subscriptions → Add Enigma2 Device (MAC + line).</li>
          <li>Use <strong>P3 HLS</strong> script on OpenPLi / OpenATV with Python 3.</li>
          <li>Bouquets follow line package — edit bouquets to control channel list.</li>
          <li>For MAG portal parity, see <Link href="/admin/devices" className="underline" style={{ color: "var(--accent)" }}>MAG & Enigma2 Center</Link>.</li>
        </ol>
      </div>
    </div>
  );
}
