"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Check, Download, QrCode, X } from "lucide-react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import {
  LINE_PLAYLIST_FORMAT_GROUPS,
  buildLineEpgUrl,
  buildLinePlayerApiUrl,
  buildLinePlaylistUrl,
  buildStalkerPortalUrl,
  buildWebPlayerUrl,
  playlistDownloadFilename,
  type LinePlaylistFormat,
} from "@/lib/line-playlist-urls";

type FilterKey = "live" | "movies" | "episodes" | "radio";

function formatKey(f: LinePlaylistFormat) {
  return `${f.type}:${f.output ?? ""}:${f.label}`;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadPlaylistModal({
  open,
  onClose,
  username,
  password,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  password: string;
}) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    live: true,
    movies: true,
    episodes: true,
    radio: true,
  });
  const [selectedKey, setSelectedKey] = useState("m3u_plus:hls:m3u With Options - HLS");
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [dlLabel, setDlLabel] = useState("");
  const [dlStatus, setDlStatus] = useState("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      setDlBusy(false);
      setDlProgress(0);
      setDlLabel("");
      setDlStatus("");
    }
  }, [open]);

  const { host, proto, origin } = useMemo(() => {
    if (typeof window === "undefined") return { host: "", proto: "https:", origin: "" };
    const host = window.location.host;
    const proto = window.location.protocol;
    return { host, proto, origin: `${proto}//${host}` };
  }, [open]);

  const selectedFormat = useMemo(() => {
    for (const group of LINE_PLAYLIST_FORMAT_GROUPS) {
      const hit = group.formats.find((f) => formatKey(f) === selectedKey);
      if (hit) return hit;
    }
    return LINE_PLAYLIST_FORMAT_GROUPS[1]?.formats[0] ?? LINE_PLAYLIST_FORMAT_GROUPS[0]?.formats[0];
  }, [selectedKey]);

  const getUrl = selectedFormat
    ? buildLinePlaylistUrl(host, proto, username, password, selectedFormat)
    : "";

  const playListUrl = `${origin}/play/list?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const qrJson = JSON.stringify(
    { portal_url: origin, username, password },
    null,
    2
  );

  if (!open) return null;

  async function copyText(text: string, label: string) {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 2000);
    }
  }

  async function downloadUrl(url: string, filename: string) {
    setDlBusy(true);
    setDlProgress(3);
    setDlLabel("");
    setDlStatus("Connecting — Live TV, Movies & Series…");
    if (tickRef.current) clearInterval(tickRef.current);
    let soft = 3;
    tickRef.current = setInterval(() => {
      soft = Math.min(soft + 1.5, 40);
      setDlProgress((p) => (p < soft ? soft : p));
      setDlStatus("Preparing playlist (Live → Movies → Series)…");
    }, 160);

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setDlStatus("Downloading Live TV, Movies & Series…");

      const totalHeader = Number(res.headers.get("content-length") || 0);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const chunks: Uint8Array[] = [];
      let received = 0;
      let lastUi = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.length;
        const now = Date.now();
        if (now - lastUi > 70) {
          lastUi = now;
          if (totalHeader > 0) {
            setDlProgress(Math.max(42, Math.min(97, Math.round((received / totalHeader) * 100))));
            setDlLabel(`${formatBytes(received)} / ${formatBytes(totalHeader)}`);
          } else {
            setDlProgress(Math.min(94, 42 + Math.log10(received + 10) * 14));
            setDlLabel(formatBytes(received));
          }
        }
      }

      setDlProgress(99);
      setDlStatus("Finishing…");
      const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setDlProgress(100);
      setDlLabel(formatBytes(received));
      setDlStatus("Complete");
    } catch {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setDlStatus("Opening in new tab…");
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setTimeout(() => {
        setDlBusy(false);
        setDlProgress(0);
        setDlLabel("");
        setDlStatus("");
      }, 600);
    }
  }

  function UrlRow({ label, url, filename }: { label: string; url: string; filename?: string }) {
    const isCopied = copiedLabel === label;
    return (
      <div className="download-playlist-url-block">
        <div className="download-playlist-url-head">
          <span className="download-playlist-url-label">{label}</span>
          <span className="download-playlist-url-actions">
            <button
              type="button"
              title="Copy"
              onClick={() => void copyText(url, label)}
              style={isCopied ? { color: "#22c55e" } : undefined}
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              type="button"
              title="Download"
              onClick={() => void downloadUrl(url, filename ?? "playlist.m3u")}
            >
              <Download size={14} />
            </button>
            <button type="button" title="QR code" onClick={() => setQrOpen(true)}>
              <QrCode size={14} />
            </button>
          </span>
        </div>
        <input readOnly className="download-playlist-url-input" value={url} onFocus={(e) => e.target.select()} />
      </div>
    );
  }

  return (
    <div className="download-playlist-overlay" role="presentation" onClick={onClose}>
      <div
        className="download-playlist-modal"
        role="dialog"
        aria-labelledby="download-playlist-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="download-playlist-header">
          <h2 id="download-playlist-title">Download Playlist</h2>
          <button type="button" className="download-playlist-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <section className="download-playlist-card">
          <div className="download-playlist-card-head">
            <div>
              <p className="download-playlist-card-title">Filters</p>
              <p className="download-playlist-card-sub">Filters apply to the download links.</p>
            </div>
            <button
              type="button"
              className="download-playlist-toggle"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <ChevronDown size={16} style={{ transform: filtersOpen ? "rotate(180deg)" : undefined }} />
            </button>
          </div>
          {filtersOpen && (
            <div className="download-playlist-filters">
              {(
                [
                  ["live", "Live streams"],
                  ["movies", "Movies"],
                  ["episodes", "Episodes"],
                  ["radio", "Radio"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="download-playlist-filter">
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="download-playlist-card">
          <p className="download-playlist-card-title mb-2">Line M3U Options</p>
          <select
            className="download-playlist-select"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
          >
            <option value="">Select an output format</option>
            {LINE_PLAYLIST_FORMAT_GROUPS.map((group) =>
              group.formats.length ? (
                <optgroup key={group.id} label={group.label}>
                  {group.formats.map((f) => (
                    <option key={formatKey(f)} value={formatKey(f)}>
                      {f.label}
                      {f.recommended ? " [recommended]" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null
            )}
          </select>
        </section>

        {selectedFormat && getUrl && (
          <>
            <UrlRow
              label="/get.php?"
              url={getUrl}
              filename={playlistDownloadFilename(username, selectedFormat)}
            />
            <UrlRow label="/play/list?" url={playListUrl} filename={`${username}-list.m3u`} />
          </>
        )}

        {(dlBusy || dlProgress > 0) && (
          <section className="download-playlist-card space-y-2">
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
              <span>{dlStatus || "Downloading…"}</span>
              <span>
                {Math.round(dlProgress)}%{dlLabel ? ` · ${dlLabel}` : ""}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-150 ease-out"
                style={{
                  width: `${Math.max(2, Math.min(100, dlProgress))}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </section>
        )}

        <section className="download-playlist-card">
          <div className="download-playlist-card-head">
            <p className="download-playlist-card-title">QR code API Integration</p>
            <button
              type="button"
              className="download-playlist-toggle"
              onClick={() => setQrOpen((v) => !v)}
              aria-expanded={qrOpen}
            >
              <ChevronDown size={16} style={{ transform: qrOpen ? "rotate(180deg)" : undefined }} />
            </button>
          </div>
          {qrOpen && (
            <div className="download-playlist-qr-grid">
              <div className="download-playlist-qr-fields">
                <label>
                  URL
                  <input readOnly value={origin} />
                </label>
                <label>
                  Username
                  <input readOnly value={username} />
                </label>
                <label>
                  Password
                  <input readOnly value={password} />
                </label>
                <pre className="download-playlist-json">{qrJson}</pre>
                <div className="download-playlist-api-links text-xs" style={{ color: "var(--muted)" }}>
                  <button type="button" className="underline" onClick={() => void copyText(buildLinePlayerApiUrl(host, proto, username, password), "Player API")}>
                    {copiedLabel === "Player API" ? <Check size={10} className="inline" /> : "M3U API"}
                  </button>
                  {" · "}
                  <button type="button" className="underline" onClick={() => void copyText(buildLineEpgUrl(host, proto, username, password), "EPG")}>
                    {copiedLabel === "EPG" ? <Check size={10} className="inline" /> : "EPG URL"}
                  </button>
                  {" · "}
                  <button type="button" className="underline" onClick={() => void copyText(buildStalkerPortalUrl(host, proto), "Stalker")}>
                    {copiedLabel === "Stalker" ? <Check size={10} className="inline" /> : "Stalker"}
                  </button>
                  {" · "}
                  <button type="button" className="underline" onClick={() => window.open(buildWebPlayerUrl(origin, username, password))}>
                    Web player
                  </button>
                </div>
              </div>
              <img
                className="download-playlist-qr-img"
                alt="QR code"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrJson)}`}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
