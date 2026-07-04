"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Maximize, Minimize, Search, Tv, X, Menu, ArrowLeft, Heart, Clock,
  Loader2, AlertCircle, MonitorPlay, ChevronUp, ChevronDown, Volume2,
  VolumeX, RotateCw, Zap, Info,
} from "lucide-react";
import { attachUrlToVideo, type StreamPlayerHandle } from "@/lib/browser-stream-player";

type LiveStream = {
  stream_id: string;
  name: string;
  stream_icon?: string;
  category_id?: string;
  num?: number;
  epg_channel_id?: string;
};

type Category = { category_id: string; category_name: string };

type EpgProgram = {
  title: string;
  start: string;
  end: string;
  desc?: string;
};

function PanelWebPlayerInner() {
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get("username") ?? "");
  const [password, setPassword] = useState(params.get("password") ?? "");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [activeCat, setActiveCat] = useState("");
  const [search, setSearch] = useState("");
  const [playingUrl, setPlayingUrl] = useState("");
  const [playingTitle, setPlayingTitle] = useState("");
  const [playingCategory, setPlayingCategory] = useState("");
  const [playingId, setPlayingId] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [buffering, setBuffering] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recent, setRecent] = useState<LiveStream[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [tab, setTab] = useState<"all" | "recent" | "fav">("all");
  const [showInfo, setShowInfo] = useState(true);
  const [epgProgram, setEpgProgram] = useState<EpgProgram | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<StreamPlayerHandle | null>(null);
  const infoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";

  // Load favorites and recent from localStorage
  useEffect(() => {
    try {
      const fav = JSON.parse(localStorage.getItem("nexlify-fav") || "[]") as string[];
      setFavorites(fav);
      const rec = JSON.parse(localStorage.getItem("nexlify-recent") || "[]") as LiveStream[];
      setRecent(rec);
      const vol = parseFloat(localStorage.getItem("nexlify-volume") || "1");
      setVolume(Number.isFinite(vol) ? vol : 1);
    } catch { /* ignore */ }
  }, []);

  const saveRecent = useCallback((s: LiveStream) => {
    setRecent((prev) => {
      const next = [s, ...prev.filter((x) => x.stream_id !== s.stream_id)].slice(0, 20);
      localStorage.setItem("nexlify-recent", JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleFav = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("nexlify-fav", JSON.stringify(next));
      return next;
    });
  }, []);

  const isFav = useCallback((id: string) => favorites.includes(id), [favorites]);

  const loadPlaylist = useCallback(async (u: string, p: string) => {
    setLoading(true);
    setError("");
    try {
      const q = `username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`;
      const [catRes, liveRes, infoRes] = await Promise.all([
        fetch(`${apiBase}/player_api.php?${q}&action=get_live_categories`, { cache: "no-store" }),
        fetch(`${apiBase}/player_api.php?${q}&action=get_live_streams`, { cache: "no-store" }),
        fetch(`${apiBase}/player_api.php?${q}`, { cache: "no-store" }),
      ]);
      const info = await infoRes.json();
      if (info?.user_info?.auth === 0) {
        throw new Error(info.user_info.message || "Login failed");
      }
      const catData = await catRes.json();
      const liveData = await liveRes.json();
      const catsArr = Array.isArray(catData) ? catData : [];
      const streamsArr = (Array.isArray(liveData) ? liveData : []).map((s: LiveStream, i: number) => ({
        ...s,
        num: i + 1,
      }));
      setCats(catsArr);
      setStreams(streamsArr);
      setActiveCat("");
      setLoggedIn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load playlist");
      setLoggedIn(false);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const u = params.get("username");
    const p = params.get("password");
    if (u && p) {
      setUsername(u);
      setPassword(p);
      void loadPlaylist(u, p);
    }
  }, [params, loadPlaylist]);

  // EPG fetch for current channel
  const fetchEpg = useCallback(async (streamId: string, username: string, password: string) => {
    if (!streamId || !username || !password) return;
    try {
      const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const res = await fetch(`${apiBase}/player_api.php?${q}&action=get_short_epg&stream_id=${streamId}`, { cache: "no-store" });
      const data = await res.json();
      const items = Array.isArray(data?.epg_listings) ? data.epg_listings : [];
      if (items.length > 0) {
        const first = items[0];
        setEpgProgram({
          title: first.title || "No program info",
          start: first.start || "",
          end: first.end || "",
          desc: first.description || "",
        });
      } else {
        setEpgProgram(null);
      }
    } catch { setEpgProgram(null); }
  }, [apiBase]);

  useEffect(() => {
    if (!playingUrl || !videoRef.current) return;
    const video = videoRef.current;
    let cancelled = false;
    setBuffering(true);
    setPlayerError("");
    setShowInfo(true);

    if (infoTimeoutRef.current) clearTimeout(infoTimeoutRef.current);
    infoTimeoutRef.current = setTimeout(() => setShowInfo(false), 4000);

    // Set volume
    video.volume = volume;
    video.muted = muted;

    void (async () => {
      try {
        playerRef.current?.destroy();
        playerRef.current = null;
        video.removeAttribute("src");
        video.load();
        if (cancelled) return;
        playerRef.current = (await attachUrlToVideo(video, playingUrl, setPlayerError)) ?? null;
      } catch (err) {
        setPlayerError(err instanceof Error ? err.message : "Player load failed");
      } finally {
        if (!cancelled) setBuffering(false);
      }
    })();

    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onError = () => {
      setBuffering(false);
      setPlayerError("Video playback error");
    };
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);

    // Fetch EPG
    if (epgTimeoutRef.current) clearTimeout(epgTimeoutRef.current);
    epgTimeoutRef.current = setTimeout(() => fetchEpg(playingId, username, password), 1000);

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      if (infoTimeoutRef.current) clearTimeout(infoTimeoutRef.current);
      if (epgTimeoutRef.current) clearTimeout(epgTimeoutRef.current);
      // Signal disconnect so the connection slot frees immediately
      if (playingId && username && password) {
        fetch("/api/live/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, streamId: playingId }),
        }).catch(() => {});
      }
    };
  }, [playingUrl, volume, muted, playingId, username, password, fetchEpg]);

  const filtered = streams.filter((s) => {
    if (activeCat && String(s.category_id ?? "") !== String(activeCat)) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function playStream(s: LiveStream) {
    setPlayerError("");
    setBuffering(true);
    const url = `${apiBase}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${s.stream_id}`;
    setPlayingUrl(url);
    setPlayingTitle(s.name);
    setPlayingId(s.stream_id);
    setPlayingCategory(cats.find((c) => String(c.category_id) === String(s.category_id))?.category_name ?? "");
    saveRecent(s);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function playNextChannel() {
    const idx = filtered.findIndex((s) => s.stream_id === playingId);
    if (idx >= 0 && idx < filtered.length - 1) {
      playStream(filtered[idx + 1]);
    }
  }

  function playPrevChannel() {
    const idx = filtered.findIndex((s) => s.stream_id === playingId);
    if (idx > 0) {
      playStream(filtered[idx - 1]);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  useEffect(() => {
    function onFsChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Disconnect on tab close
  useEffect(() => {
    function onBeforeUnload() {
      if (playingId && username && password) {
        const data = JSON.stringify({ username, password, streamId: playingId });
        navigator.sendBeacon(
          "/api/live/disconnect",
          new Blob([data], { type: "application/json" })
        );
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [playingId, username, password]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!loggedIn) return;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        playNextChannel();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        playPrevChannel();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        setMuted((m) => {
          const next = !m;
          if (videoRef.current) videoRef.current.muted = next;
          return next;
        });
      } else if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (playingUrl) {
          setPlayingUrl("");
          setPlayingTitle("");
          setPlayingCategory("");
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loggedIn, playingId, streams, filtered, playingUrl]);

  const displayStreams =
    tab === "fav"
      ? filtered.filter((s) => isFav(s.stream_id))
      : tab === "recent"
        ? recent.filter((s) => (search ? s.name.toLowerCase().includes(search.toLowerCase()) : true))
        : filtered;

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e14] p-4">
        <form
          className="w-full max-w-md rounded-xl border p-6 space-y-4"
          style={{ borderColor: "rgba(0,192,239,0.3)", background: "#111820" }}
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void loadPlaylist(username, password);
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Tv className="text-[#00c0ef]" size={24} />
            <h1 className="text-xl font-semibold text-white">Nexlify Web Player</h1>
          </div>
          <p className="text-sm text-neutral-400">Built-in browser player — same server as your panel.</p>
          <input
            className="w-full rounded-lg border px-3 py-2.5 bg-black/40 text-white text-sm outline-none focus:border-[#00c0ef]/50 transition"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2.5 bg-black/40 text-white text-sm outline-none focus:border-[#00c0ef]/50 transition"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-white cursor-pointer disabled:opacity-50 transition hover:opacity-90"
            style={{ background: "#00c0ef" }}
          >
            {loading ? "Loading…" : "Watch Live TV"}
          </button>
          <p className="text-[10px] text-neutral-500 text-center">
            Keyboard shortcuts: ↑/↓ switch channels · F fullscreen · M mute · Esc close
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0e14] text-white overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`shrink-0 border-r flex flex-col transition-all duration-300 z-30 ${
          sidebarOpen
            ? "w-64 absolute h-full md:relative md:w-56"
            : "w-0 md:w-56 overflow-hidden"
        }`}
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#111820" }}
      >
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Logged in as</p>
            <p className="text-sm font-medium truncate">{username}</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 rounded hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-2 flex-1 overflow-y-auto space-y-1">
          <button
            type="button"
            onClick={() => {
              setTab("all");
              setActiveCat("");
            }}
            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition ${
              tab === "all" && !activeCat ? "bg-[#00c0ef]/20 text-[#00c0ef]" : "text-neutral-400 hover:text-white"
            }`}
          >
            <MonitorPlay size={14} /> All channels
          </button>
          <button
            type="button"
            onClick={() => setTab("recent")}
            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition ${
              tab === "recent" ? "bg-[#00c0ef]/20 text-[#00c0ef]" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Clock size={14} /> Recent
          </button>
          <button
            type="button"
            onClick={() => setTab("fav")}
            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition ${
              tab === "fav" ? "bg-[#00c0ef]/20 text-[#00c0ef]" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Heart size={14} /> Favorites
          </button>
          <div className="pt-2 border-t mt-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <p className="px-2 text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Categories</p>
            {cats.map((c) => (
              <button
                key={c.category_id}
                type="button"
                onClick={() => {
                  setTab("all");
                  setActiveCat(String(c.category_id));
                }}
                className={`w-full text-left px-2 py-1.5 rounded text-sm truncate transition ${
                  String(activeCat) === String(c.category_id)
                    ? "bg-[#00c0ef]/20 text-[#00c0ef]"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {c.category_name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="p-3 border-b flex gap-3 items-center" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 rounded hover:bg-white/10"
          >
            <Menu size={18} />
          </button>
          <div
            className="flex items-center gap-2 flex-1 bg-black/30 rounded-lg px-3 py-2 border"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <Search size={16} className="text-neutral-500 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder-neutral-600 text-white"
              placeholder="Search channels…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-neutral-500 shrink-0">{displayStreams.length} channels</span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-white/10 text-neutral-400"
            title="Toggle fullscreen (F)"
          >
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>

        {/* Channel grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {displayStreams.map((s) => (
            <button
              key={s.stream_id}
              type="button"
              onClick={() => playStream(s)}
              className={`text-left rounded-xl border p-2 hover:border-[#00c0ef]/50 transition group relative ${
                playingTitle === s.name ? "border-[#00c0ef] ring-1 ring-[#00c0ef]/30" : "border-white/5"
              }`}
              style={{ background: "#111820" }}
            >
              <div className="aspect-video rounded-lg bg-black/40 mb-2 flex items-center justify-center overflow-hidden relative">
                {s.stream_icon ? (
                  <img src={s.stream_icon} alt="" className="w-full h-full object-contain" loading="lazy" />
                ) : (
                  <Tv size={20} className="text-neutral-600" />
                )}
                <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-neutral-300 font-mono">
                  {s.num}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFav(s.stream_id);
                  }}
                  className={`absolute top-1 right-1 p-1 rounded-full bg-black/50 hover:bg-black/80 transition ${
                    isFav(s.stream_id) ? "text-red-400" : "text-neutral-400 opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Heart size={12} fill={isFav(s.stream_id) ? "currentColor" : "none"} />
                </button>
              </div>
              <p className="text-xs font-medium truncate">{s.name}</p>
            </button>
          ))}
          {displayStreams.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center text-sm py-12" style={{ color: "var(--muted)" }}>
              <MonitorPlay size={32} className="mb-2 opacity-40" />
              <p>No channels found</p>
              {tab === "fav" && <p className="text-xs mt-1">Add favorites by clicking the heart icon</p>}
            </div>
          )}
        </div>
      </main>

      {/* Player overlay */}
      {playingUrl && (
        <div
          ref={boxRef}
          className={`fixed z-50 bg-black shadow-2xl border border-white/10 ${
            fullscreen
              ? "inset-0"
              : "bottom-4 right-4 w-[min(520px,92vw)] rounded-xl overflow-hidden"
          }`}
        >
          <div className="relative">
            <video
              ref={videoRef}
              className="w-full aspect-video bg-black"
              controls
              playsInline
              onVolumeChange={() => {
                if (videoRef.current) {
                  setVolume(videoRef.current.volume);
                  setMuted(videoRef.current.muted);
                  localStorage.setItem("nexlify-volume", String(videoRef.current.volume));
                }
              }}
            />
            {buffering && !playerError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none gap-2">
                <Loader2 size={32} className="animate-spin text-[#00c0ef]" />
                <p className="text-xs text-neutral-400">Loading stream…</p>
              </div>
            )}
            {playerError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 pointer-events-auto">
                <AlertCircle size={28} className="text-red-400" />
                <p className="text-sm text-red-400 px-4 text-center">{playerError}</p>
                <button
                  onClick={() => {
                    setPlayerError("");
                    setBuffering(true);
                    // Force re-attach
                    const video = videoRef.current;
                    if (video) {
                      playerRef.current?.destroy();
                      playerRef.current = null;
                      video.removeAttribute("src");
                      video.load();
                      void (async () => {
                        playerRef.current = (await attachUrlToVideo(video, playingUrl, setPlayerError)) ?? null;
                        setBuffering(false);
                      })();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white bg-[#00c0ef] hover:opacity-90 transition"
                >
                  <RotateCw size={14} /> Retry
                </button>
              </div>
            )}

            {/* Info overlay (auto-hides) */}
            {showInfo && !playerError && (
              <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                <div className="flex items-end justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{playingTitle}</p>
                    {playingCategory && <p className="text-[10px] text-neutral-400">{playingCategory}</p>}
                    {epgProgram && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Zap size={10} className="text-yellow-400 shrink-0" />
                        <p className="text-[10px] text-neutral-300 truncate">
                          {epgProgram.title}
                          {epgProgram.start && epgProgram.end && (
                            <span className="text-neutral-500 ml-1">
                              {String(epgProgram.start).slice(0, 4)}:{String(epgProgram.start).slice(4, 6)} - {String(epgProgram.end).slice(0, 4)}:{String(epgProgram.end).slice(4, 6)}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Top controls */}
            <div className="absolute top-0 inset-x-0 p-2 flex justify-between bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setPlayingUrl("");
                    setPlayingTitle("");
                    setPlayingCategory("");
                    setPlayingId("");
                    setEpgProgram(null);
                  }}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/80 shrink-0 transition"
                >
                  <ArrowLeft size={14} />
                </button>
                <div className="min-w-0">
                  <span className="text-xs font-medium truncate block">{playingTitle}</span>
                  {playingCategory && (
                    <span className="text-[10px] text-neutral-400 truncate block">{playingCategory}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMuted((m) => {
                    const next = !m;
                    if (videoRef.current) videoRef.current.muted = next;
                    return next;
                  })}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/80 transition"
                  title="Mute (M)"
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button
                  type="button"
                  onClick={playPrevChannel}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/80 transition"
                  title="Previous channel"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={playNextChannel}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/80 transition"
                  title="Next channel"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/80 transition"
                  title="Fullscreen (F)"
                >
                  {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlayingUrl("");
                    setPlayingTitle("");
                    setPlayingCategory("");
                    setPlayingId("");
                    setEpgProgram(null);
                  }}
                  className="p-1.5 rounded bg-black/50 hover:bg-black/80 transition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PanelWebPlayer() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0e14] flex items-center justify-center text-neutral-500">
          <Loader2 size={24} className="animate-spin" />
          <span className="ml-2 text-sm">Loading player…</span>
        </div>
      }
    >
      <PanelWebPlayerInner />
    </Suspense>
  );
}
