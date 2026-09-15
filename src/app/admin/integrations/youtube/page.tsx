"use client";

import { useEffect, useState } from "react";
import { HostedMediaIntegrationPage } from "@/components/hosted-media-integration-page";

type VideoHit = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  hd: boolean;
};
type PlaylistHit = { playlistId: string; title: string; itemCount: number; thumbnail: string };

export default function YoutubeIntegrationPage() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [q, setQ] = useState("");
  const [hdOnly, setHdOnly] = useState(true);
  const [videos, setVideos] = useState<VideoHit[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistHit[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/integrations/youtube/search")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)));
  }, []);

  async function saveKey() {
    setBusy("key");
    const res = await fetch("/api/admin/integrations/youtube/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    setConfigured(Boolean(data.configured));
    setMsg(res.ok ? "YouTube Data API key saved." : data.error ?? "Save failed");
  }

  async function search(kind: "videos" | "playlists") {
    setBusy(kind);
    setMsg("");
    const params = new URLSearchParams({ q });
    if (kind === "playlists") params.set("playlists", "1");
    if (hdOnly) params.set("hd", "1");
    const res = await fetch(`/api/admin/integrations/youtube/search?${params}`);
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setMsg(data.error ?? "Search failed");
      return;
    }
    setVideos(data.videos ?? []);
    setPlaylists(data.playlists ?? []);
  }

  return (
    <div className="space-y-8">
      <section
        className="rounded-2xl border p-5 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div>
          <h2 className="text-lg font-semibold">YouTube Data API v3</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Official search.list / videos.list / playlists — HD filter and playlist import. 1-Stream does
            not ship this. RSS + Invidious still work below if no key is set.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            className="rounded border px-3 py-2 bg-transparent text-sm flex-1 min-w-[220px]"
            style={{ borderColor: "var(--border)" }}
            placeholder={configured ? "Key saved — paste to replace" : "AIza… Data API key"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button type="button" className="btn-positive rounded-lg px-3 py-2 text-sm" disabled={busy === "key"} onClick={() => void saveKey()}>
            {busy === "key" ? "Saving…" : "Save key"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="rounded border px-3 py-2 bg-transparent text-sm flex-1 min-w-[200px]"
            style={{ borderColor: "var(--border)" }}
            placeholder="Search videos or playlists"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={hdOnly} onChange={(e) => setHdOnly(e.target.checked)} />
            HD only
          </label>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }} disabled={!q || Boolean(busy)} onClick={() => void search("videos")}>
            {busy === "videos" ? "Searching…" : "Search videos"}
          </button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }} disabled={!q || Boolean(busy)} onClick={() => void search("playlists")}>
            {busy === "playlists" ? "Searching…" : "Search playlists"}
          </button>
        </div>
        {msg ? <p className="text-sm">{msg}</p> : null}
        {videos.length > 0 ? (
          <ul className="grid sm:grid-cols-2 gap-3">
            {videos.map((v) => (
              <li key={v.videoId} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <p className="font-medium">{v.title}</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {v.channelTitle}
                  {v.hd ? " · HD" : ""}
                </p>
                <a
                  className="text-xs mt-2 inline-block"
                  style={{ color: "var(--accent)" }}
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on YouTube
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {playlists.length > 0 ? (
          <ul className="space-y-2">
            {playlists.map((p) => (
              <li key={p.playlistId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {p.title}{" "}
                  <span style={{ color: "var(--muted)" }}>({p.itemCount} videos)</span>
                </span>
                <a
                  href={`https://www.youtube.com/playlist?list=${p.playlistId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  Open playlist
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <HostedMediaIntegrationPage
        def={{
          type: "youtube",
          title: "YouTube channels",
          description:
            "Registers a YouTube channel as live stream entries. Playback resolves via Invidious/relay on your LB stream server.",
          urlLabel: "Channel URL",
          urlPlaceholder: "https://www.youtube.com/@channel",
          channelMode: true,
        }}
      />
    </div>
  );
}
