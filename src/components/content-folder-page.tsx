"use client";



import Link from "next/link";

import { useEffect, useState } from "react";

import {

  CONTENT_FOLDERS,

  contentFolderHref,

  getContentFolder,

  type ContentFolderSlug,

} from "@/lib/content-folders";

import { StreamProbePlayer } from "@/components/stream-probe-player";
import { StreamFeatureBadges } from "@/components/stream-advanced-sections";
import { AdminVideoManagement } from "@/components/admin-video-management";



type StreamRow = {
  id: string;
  name: string;
  streamUrl: string;
  isActive: boolean;
  category?: { name: string } | null;
  isShifted?: boolean;
  timeshiftSeconds?: number | null;
  dnsRotator?: unknown;
  bitrates?: unknown;
  parentStream?: { name: string } | null;
};



export function ContentHubPage({ panel }: { panel: "admin" | "reseller" }) {

  return (

    <div className="space-y-6">

      <h1 className="text-2xl font-semibold">Content</h1>

      <p className="text-sm" style={{ color: "var(--muted)" }}>

        Browse streams, VOD, EPG, playlists, and other media libraries.

      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {CONTENT_FOLDERS.map((f) => (

          <Link

            key={f.slug}

            href={contentFolderHref(panel, f.slug)}

            className="rounded-lg border p-4 block hover:opacity-90"

            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}

          >

            <div className="font-medium capitalize">{f.title}</div>

            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>

              {f.description}

            </div>

          </Link>

        ))}

      </div>

    </div>

  );

}



export function ContentFolderPage({

  panel,

  slug,

}: {

  panel: "admin" | "reseller";

  slug: ContentFolderSlug;

}) {

  const folder = getContentFolder(slug);

  const [streams, setStreams] = useState<StreamRow[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(slug === "streams");



  useEffect(() => {

    if (slug !== "streams" || panel !== "admin") return;

    setLoading(true);

    fetch("/api/admin/streams?type=LIVE&lite=1")

      .then((r) => r.json())

      .then((d) => {

        setStreams(d.streams ?? []);

        setLoading(false);

      });

  }, [slug, panel]);



  if (!folder) {

    return <p>Unknown folder</p>;

  }

  if (slug === "video" && panel === "admin") {
    return <AdminVideoManagement />;
  }

  const selected = streams.find((s) => s.id === selectedId);
  const filteredStreams = streams.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.streamUrl.toLowerCase().includes(q) ||
      (s.category?.name ?? "").toLowerCase().includes(q)
    );
  });



  return (

    <div className="space-y-6">

      <div className="flex flex-wrap gap-3 items-center">

        <h1 className="text-2xl font-semibold flex-1">{folder.title}</h1>

        <Link href={`/${panel}/content`} className="text-sm" style={{ color: "var(--accent)" }}>

          ← Content

        </Link>

        {slug === "streams" && panel === "admin" && (
          <>
            <Link href="/admin/streams/add" className="xui-lines-header-btn xui-lines-header-btn--primary text-sm px-3 py-2 rounded">
              Add stream
            </Link>
            <Link href="/admin/management/mass-edit" className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)" }}>
              Mass edit
            </Link>
            <Link href="/admin/stream_health" className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)" }}>
              Stream health
            </Link>
          </>
        )}

      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>{folder.description}</p>



      {slug === "vod" && panel === "admin" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/admin/content/movies"
              className="rounded-lg border p-5 block hover:opacity-90 transition-opacity"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="font-semibold text-lg mb-1">Movies</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Browse and manage movie library, posters, and metadata.
              </div>
            </Link>
            <Link
              href="/admin/content/series"
              className="rounded-lg border p-5 block hover:opacity-90 transition-opacity"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="font-semibold text-lg mb-1">TV Series</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Manage series, seasons, episodes, and scheduling.
              </div>
            </Link>
            <Link
              href="/admin/settings/vod-proxy"
              className="rounded-lg border p-5 block hover:opacity-90 transition-opacity"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <div className="font-semibold text-lg mb-1">VOD Proxy</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Hide original source URLs and configure streaming proxy.
              </div>
            </Link>
          </div>
        </div>
      )}



      {slug === "vod" && panel === "reseller" && (

        <div className="grid sm:grid-cols-2 gap-4">

          <Link href="/reseller/movies" className="rounded-lg border p-4 block" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>

            Movies preview

          </Link>

          <Link href="/reseller/episodes" className="rounded-lg border p-4 block" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>

            Episodes preview

          </Link>

        </div>

      )}



      {slug === "epg" && panel === "admin" && (

        <div className="flex flex-wrap gap-3">

          <Link href="/admin/epg/sources" className="text-sm px-3 py-2 rounded" style={{ background: "var(--accent)", color: "#fff" }}>

            EPG sources

          </Link>

          <Link href="/admin/epg/channels" className="text-sm px-3 py-2 rounded border" style={{ borderColor: "var(--border)" }}>

            Channel map

          </Link>

        </div>

      )}



      {slug === "playlists" && panel === "admin" && (

        <Link href="/admin/import/m3u" className="text-sm px-3 py-2 rounded inline-block" style={{ background: "var(--accent)", color: "#fff" }}>

          Import M3U playlist

        </Link>

      )}



      {slug === "streams" && panel === "admin" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="search"
                placeholder="Search streams…"
                className="w-full rounded border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {filteredStreams.length} stream{filteredStreams.length !== 1 ? "s" : ""}
              {search.trim() && streams.length !== filteredStreams.length ? ` (of ${streams.length})` : ""}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div
                className="rounded-lg border overflow-auto max-h-[60vh]"
                style={{ borderColor: "var(--border)" }}
              >
                {loading && (
                  <p className="p-4 text-sm" style={{ color: "var(--muted)" }}>
                    Loading streams…
                  </p>
                )}
                {!loading && filteredStreams.length === 0 && (
                  <p className="p-4 text-sm" style={{ color: "var(--muted)" }}>
                    {streams.length ? "No streams match your search." : "No live streams yet."}
                  </p>
                )}
                <ul className="text-sm divide-y" style={{ borderColor: "var(--border)" }}>
                  {filteredStreams.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 cursor-pointer hover:opacity-90"
                        style={{
                          background:
                            selectedId === s.id ? "rgba(94,184,232,0.15)" : "transparent",
                        }}
                        onClick={() => setSelectedId(s.id)}
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="block mt-0.5">
                          <StreamFeatureBadges stream={s} />
                        </span>
                        <span className="block text-xs" style={{ color: "var(--muted)" }}>
                          {s.category?.name ?? "—"} · {s.isActive ? "Active" : "Off"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              {selected ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm flex-1">{selected.name}</span>
                    <Link
                      href={`/admin/servers/streams?edit=${selected.id}`}
                      className="text-xs px-3 py-1.5 rounded border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Full edit
                    </Link>
                    <a
                      href={selected.streamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 rounded border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Open source
                    </a>
                  </div>
                  <StreamProbePlayer
                    playFirst
                    streamId={selected.id}
                    streamUrl={selected.streamUrl}
                    name={selected.name}
                  />
                </div>
              ) : (
                <p
                  className="text-sm rounded-lg border p-6"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  Select a stream to probe playback and check if the source is working.
                </p>
              )}
            </div>
          </div>
        </div>
      )}



      {slug !== "streams" &&

        !folder.adminRedirect &&

        !folder.resellerRedirect &&

        slug !== "vod" &&

        slug !== "epg" &&

        slug !== "playlists" && (

          <p className="text-sm rounded-lg border p-4" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>

            This section is ready in the panel structure. Full {folder.title.toLowerCase()} management will be added in a future update.

          </p>

        )}

    </div>

  );

}


