"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Maximize, Minimize, Search, Tv, X } from "lucide-react";

type LiveStream = {
  stream_id: string;
  name: string;
  stream_icon?: string;
  category_id?: string;
};

type Category = { category_id: string; category_name: string };

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
  const [fullscreen, setFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";

  const loadPlaylist = useCallback(async (u: string, p: string) => {
    setLoading(true);
    setError("");
    try {
      const q = `username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`;
      const [catRes, liveRes, infoRes] = await Promise.all([
        fetch(`${apiBase}/player_api.php?${q}&action=get_live_categories`),
        fetch(`${apiBase}/player_api.php?${q}&action=get_live_streams`),
        fetch(`${apiBase}/player_api.php?${q}`),
      ]);
      const info = await infoRes.json();
      if (info?.user_info?.auth === 0) {
        throw new Error(info.user_info.message || "Login failed");
      }
      const catData = await catRes.json();
      const liveData = await liveRes.json();
      setCats(Array.isArray(catData) ? catData : []);
      setStreams(Array.isArray(liveData) ? liveData : []);
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

  useEffect(() => {
    if (!playingUrl || !videoRef.current) return;
    const video = videoRef.current;
    let destroyed = false;
    let hlsInstance: { destroy: () => void } | null = null;

    async function play() {
      if (playingUrl.endsWith(".ts") || playingUrl.includes("/live/")) {
        video.src = playingUrl;
        await video.play().catch(() => {});
        return;
      }
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playingUrl;
        await video.play().catch(() => {});
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("HLS load failed"));
        document.head.appendChild(script);
      });
      const Hls = (window as unknown as { Hls?: { isSupported: () => boolean; new (cfg?: object): { loadSource: (u: string) => void; attachMedia: (v: HTMLVideoElement) => void; on: (e: string, cb: () => void) => void; destroy: () => void } } }).Hls;
      if (!Hls?.isSupported() || destroyed) return;
      const hls = new Hls();
      hls.loadSource(playingUrl);
      hls.attachMedia(video);
      hls.on("MANIFEST_PARSED", () => video.play().catch(() => {}));
      hlsInstance = hls;
    }
    void play();
    return () => {
      destroyed = true;
      hlsInstance?.destroy();
    };
  }, [playingUrl]);

  function playStream(s: LiveStream) {
    const url = `${apiBase}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${s.stream_id}.m3u8`;
    setPlayingUrl(url);
    setPlayingTitle(s.name);
  }

  const filtered = streams.filter((s) => {
    if (activeCat && s.category_id !== activeCat) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e14] p-4">
        <form
          className="w-full max-w-md rounded-xl border p-6 space-y-4"
          style={{ borderColor: "rgba(0,192,239,0.3)", background: "#111820" }}
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
            className="w-full rounded border px-3 py-2 bg-black/40 text-white text-sm"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full rounded border px-3 py-2 bg-black/40 text-white text-sm"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded py-2.5 text-sm font-medium text-white"
            style={{ background: "#00c0ef" }}
          >
            {loading ? "Loading…" : "Watch Live TV"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0e14] text-white overflow-hidden">
      <aside className="w-56 shrink-0 border-r flex flex-col" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#111820" }}>
        <div className="p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <p className="text-xs text-neutral-500">Logged in as</p>
          <p className="text-sm font-medium truncate">{username}</p>
        </div>
        <div className="p-2 flex-1 overflow-y-auto space-y-1">
          <button
            type="button"
            onClick={() => setActiveCat("")}
            className={`w-full text-left px-2 py-1.5 rounded text-sm ${!activeCat ? "bg-[#00c0ef]/20 text-[#00c0ef]" : "text-neutral-400 hover:text-white"}`}
          >
            All channels
          </button>
          {cats.map((c) => (
            <button
              key={c.category_id}
              type="button"
              onClick={() => setActiveCat(c.category_id)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${activeCat === c.category_id ? "bg-[#00c0ef]/20 text-[#00c0ef]" : "text-neutral-400 hover:text-white"}`}
            >
              {c.category_name}
            </button>
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b flex gap-2 items-center" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <Search size={16} className="text-neutral-500 shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder-neutral-600"
            placeholder="Search channels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-xs text-neutral-500">{filtered.length} channels</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {filtered.map((s) => (
            <button
              key={s.stream_id}
              type="button"
              onClick={() => playStream(s)}
              className={`text-left rounded-lg border p-2 hover:border-[#00c0ef]/50 transition ${playingTitle === s.name ? "border-[#00c0ef]" : "border-white/5"}`}
              style={{ background: "#111820" }}
            >
              <div className="aspect-video rounded bg-black/40 mb-2 flex items-center justify-center overflow-hidden">
                {s.stream_icon ? (
                  <img src={s.stream_icon} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Tv size={20} className="text-neutral-600" />
                )}
              </div>
              <p className="text-xs font-medium truncate">{s.name}</p>
            </button>
          ))}
        </div>
      </main>
      {playingUrl && (
        <div
          ref={boxRef}
          className={`fixed z-50 bg-black shadow-2xl border border-white/10 ${fullscreen ? "inset-0" : "bottom-4 right-4 w-[min(480px,92vw)] rounded-xl overflow-hidden"}`}
        >
          <div className="relative">
            <video ref={videoRef} className="w-full aspect-video bg-black" controls playsInline />
            <div className="absolute top-0 inset-x-0 p-2 flex justify-between bg-gradient-to-b from-black/80 to-transparent">
              <span className="text-xs truncate max-w-[70%]">{playingTitle}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="p-1 rounded bg-black/50"
                  onClick={() => {
                    if (!boxRef.current) return;
                    if (!document.fullscreenElement) boxRef.current.requestFullscreen();
                    else document.exitFullscreen();
                    setFullscreen(!fullscreen);
                  }}
                >
                  {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
                <button type="button" className="p-1 rounded bg-black/50" onClick={() => { setPlayingUrl(""); setPlayingTitle(""); }}>
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
    <Suspense fallback={<div className="min-h-screen bg-[#0a0e14] flex items-center justify-center text-neutral-500">Loading player…</div>}>
      <PanelWebPlayerInner />
    </Suspense>
  );
}
