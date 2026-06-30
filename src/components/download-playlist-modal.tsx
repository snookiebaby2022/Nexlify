"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Download, QrCode, X } from "lucide-react";
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
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied`);
    } catch {
      prompt(`Copy ${label}:`, text);
    }
  }

  async function downloadUrl(url: string, filename: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function UrlRow({ label, url, filename }: { label: string; url: string; filename?: string }) {
    return (
      <div className="download-playlist-url-block">
        <div className="download-playlist-url-head">
          <span className="download-playlist-url-label">{label}</span>
          <span className="download-playlist-url-actions">
            <button type="button" title="Copy" onClick={() => void copyText(url, label)}>
              <Copy size={14} />
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
                    M3U API
                  </button>
                  {" · "}
                  <button type="button" className="underline" onClick={() => void copyText(buildLineEpgUrl(host, proto, username, password), "EPG")}>
                    EPG URL
                  </button>
                  {" · "}
                  <button type="button" className="underline" onClick={() => void copyText(buildStalkerPortalUrl(host, proto), "Stalker")}>
                    Stalker
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
