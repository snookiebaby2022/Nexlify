"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import {
  Tv,
  Film,
  MonitorPlay,
  Search,
  Heart,
  Settings,
  LogOut,
  Maximize,
  Minimize,
  Play,
  Star,
  Globe,
  User,
  Link as LinkIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Menu,
  Info,
  Clock,
  CalendarDays,
  Trash2,
} from "lucide-react";

/* ─── Types ─── */

interface Profile {
  id: string;
  name: string;
  type: "xtream" | "m3u";
  server?: string;
  username?: string;
  password?: string;
  m3uUrl?: string;
  userAgent?: string;
}

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface LiveStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  epg_channel_id?: string;
  category_id: string;
}

interface VodStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id: string;
  container_extension?: string;
}

interface Series {
  series_id: number;
  name: string;
  cover?: string;
  category_id: string;
}

interface EpgProgram {
  title: string;
  start: string;
  end: string;
  description?: string;
}

/* ─── Helpers ─── */

const LS_KEY = "nexlify_webplayer_profiles";
const LS_FAVS = "nexlify_webplayer_favs";
const LS_LAST = "nexlify_webplayer_last_profile";

function loadProfiles(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(p: Profile[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
}

function loadFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
  } catch {
    return [];
  }
}

function saveFavs(f: string[]) {
  localStorage.setItem(LS_FAVS, JSON.stringify(f));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function buildXtreamUrl(base: string, action: string, u: string, p: string) {
  const b = base.replace(/\/$/, "");
  return `${b}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&action=${action}`;
}

function buildStreamUrl(base: string, type: "live" | "movie" | "series", id: number, ext?: string, u?: string, pw?: string) {
  const b = base.replace(/\/$/, "");
  if (u && pw) {
    return `${b}/${type}/${u}/${pw}/${id}.${ext || "ts"}`;
  }
  return `${b}/${type}/${id}.${ext || "ts"}`;
}

/* ─── M3U Parser ─── */

interface M3uChannel {
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
}

function parseM3u(text: string): M3uChannel[] {
  const lines = text.split("\n");
  const channels: M3uChannel[] = [];
  let current: Partial<M3uChannel> = {};
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith("#EXTINF")) {
      const nameMatch = l.match(/,(.+)$/);
      const groupMatch = l.match(/group-title="([^"]+)"/);
      const logoMatch = l.match(/tvg-logo="([^"]+)"/);
      const idMatch = l.match(/tvg-id="([^"]+)"/);
      current = {
        name: nameMatch ? nameMatch[1].trim() : "Unknown",
        group: groupMatch ? groupMatch[1] : "General",
        logo: logoMatch ? logoMatch[1] : undefined,
        tvgId: idMatch ? idMatch[1] : undefined,
      };
    } else if (l && !l.startsWith("#") && current.name) {
      channels.push({
        name: current.name,
        url: l,
        group: current.group || "General",
        logo: current.logo,
        tvgId: current.tvgId,
      });
      current = {};
    }
  }
  return channels;
}

/* ─── Component ─── */

export default function WebPlayerPage() {
  /* Profiles */
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [loginTab, setLoginTab] = useState<"xtream" | "m3u">("xtream");

  /* Xtream form */
  const [svr, setSvr] = useState("");
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [profName, setProfName] = useState("");

  /* M3U form */
  const [m3uUrl, setM3uUrl] = useState("");
  const [m3uUA, setM3uUA] = useState("");

  /* Data */
  const [liveCats, setLiveCats] = useState<Category[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [vodCats, setVodCats] = useState<Category[]>([]);
  const [vodStreams, setVodStreams] = useState<VodStream[]>([]);
  const [seriesCats, setSeriesCats] = useState<Category[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [m3uChannels, setM3uChannels] = useState<M3uChannel[]>([]);
  const [epg, setEpg] = useState<Record<number, EpgProgram[]>>({});

  const [favs, setFavs] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("");
  const [activeTab, setActiveTab] = useState<"live" | "movies" | "series" | "favs">("live");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768; // open on md+ (tablet/desktop), closed on mobile
    }
    return true;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Player */
  const [playingUrl, setPlayingUrl] = useState("");
  const [playingTitle, setPlayingTitle] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  /* Init */
  useEffect(() => {
    const saved = loadProfiles();
    setProfiles(saved);
    const lastId = localStorage.getItem(LS_LAST);
    if (lastId) {
      const last = saved.find((p) => p.id === lastId);
      if (last) {
        setActiveProfile(last);
        setShowLogin(false);
      }
    }
    setFavs(loadFavs());
  }, []);

  /* HLS Player */
  useEffect(() => {
    if (!playingUrl || !videoRef.current) return;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
      hls.loadSource(playingUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playingUrl;
      video.play().catch(() => {});
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playingUrl]);

  /* Fullscreen */
  const toggleFullscreen = useCallback(() => {
    if (!playerRef.current) return;
    if (!document.fullscreenElement) {
      playerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  /* Load Xtream data */
  const loadXtreamData = useCallback(
    async (profile: Profile) => {
      if (!profile.server || !profile.username || !profile.password) return;
      setLoading(true);
      setError("");
      try {
        const [liveC, liveS, vodC, vodS, serC, serL] = await Promise.all([
          fetch(buildXtreamUrl(profile.server, "get_live_categories", profile.username, profile.password)).then((r) => r.json()),
          fetch(buildXtreamUrl(profile.server, "get_live_streams", profile.username, profile.password)).then((r) => r.json()),
          fetch(buildXtreamUrl(profile.server, "get_vod_categories", profile.username, profile.password)).then((r) => r.json()),
          fetch(buildXtreamUrl(profile.server, "get_vod_streams", profile.username, profile.password)).then((r) => r.json()),
          fetch(buildXtreamUrl(profile.server, "get_series_categories", profile.username, profile.password)).then((r) => r.json()),
          fetch(buildXtreamUrl(profile.server, "get_series", profile.username, profile.password)).then((r) => r.json()),
        ]);
        setLiveCats(Array.isArray(liveC) ? liveC : []);
        setLiveStreams(Array.isArray(liveS) ? liveS : []);
        setVodCats(Array.isArray(vodC) ? vodC : []);
        setVodStreams(Array.isArray(vodS) ? vodS : []);
        setSeriesCats(Array.isArray(serC) ? serC : []);
        setSeriesList(Array.isArray(serL) ? serL : []);
      } catch (e) {
        setError("Failed to load playlist data. Check your server URL and credentials.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* Load M3U data */
  const loadM3uData = useCallback(async (profile: Profile) => {
    if (!profile.m3uUrl) return;
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (profile.userAgent) headers["User-Agent"] = profile.userAgent;
      const res = await fetch(profile.m3uUrl, { headers });
      if (!res.ok) throw new Error("Failed to fetch M3U");
      const text = await res.text();
      const channels = parseM3u(text);
      setM3uChannels(channels);
      setLiveCats(
        Array.from(new Set(channels.map((c) => c.group))).map((g) => ({
          category_id: g,
          category_name: g,
          parent_id: 0,
        }))
      );
      setLiveStreams(
        channels.map((c, i) => ({
          stream_id: i,
          name: c.name,
          stream_icon: c.logo,
          epg_channel_id: c.tvgId,
          category_id: c.group,
        }))
      );
    } catch (e) {
      setError("Failed to load M3U playlist. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Load data when profile changes */
  useEffect(() => {
    if (!activeProfile) return;
    localStorage.setItem(LS_LAST, activeProfile.id);
    if (activeProfile.type === "xtream") {
      loadXtreamData(activeProfile);
    } else {
      loadM3uData(activeProfile);
    }
  }, [activeProfile, loadXtreamData, loadM3uData]);

  /* Play stream */
  const playStream = useCallback(
    (stream: LiveStream | VodStream | M3uChannel) => {
      let url = "";
      if (activeProfile?.type === "xtream" && "stream_id" in stream) {
        const isLive = activeTab === "live";
        const type = isLive ? "live" : "movie";
        url = buildStreamUrl(
          activeProfile.server!,
          type,
          stream.stream_id,
          (stream as VodStream).container_extension,
          activeProfile.username,
          activeProfile.password
        );
      } else if ("url" in stream) {
        url = stream.url;
      }
      if (url) {
        setPlayingUrl(url);
        setPlayingTitle(stream.name);
      }
    },
    [activeProfile, activeTab]
  );

  /* Favorites toggle */
  const toggleFav = useCallback(
    (id: string) => {
      setFavs((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        saveFavs(next);
        return next;
      });
    },
    []
  );

  /* EPG fetch for a stream */
  const fetchEpg = useCallback(
    async (streamId: number, epgId?: string) => {
      if (!activeProfile || activeProfile.type !== "xtream" || !epgId) return;
      try {
        const url = `${activeProfile.server?.replace(/\/$/, "")}/player_api.php?username=${encodeURIComponent(
          activeProfile.username!
        )}&password=${encodeURIComponent(activeProfile.password!)}&action=get_short_epg&stream_id=${streamId}&limit=5`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.epg_listings) {
          setEpg((prev) => ({
            ...prev,
            [streamId]: data.epg_listings.map((e: any) => ({
              title: e.title || "No title",
              start: e.start || "",
              end: e.end || "",
              description: e.description || "",
            })),
          }));
        }
      } catch {
        /* ignore EPG errors */
      }
    },
    [activeProfile]
  );

  /* Save profile */
  const saveProfile = () => {
    const name = profName.trim() || (loginTab === "xtream" ? `${usr}@${svr}` : "M3U Playlist");
    let profile: Profile;
    if (loginTab === "xtream") {
      if (!svr || !usr || !pwd) {
        setError("Please fill in all fields.");
        return;
      }
      profile = { id: genId(), name, type: "xtream", server: svr, username: usr, password: pwd };
    } else {
      if (!m3uUrl) {
        setError("Please enter an M3U URL.");
        return;
      }
      profile = { id: genId(), name, type: "m3u", m3uUrl, userAgent: m3uUA || undefined };
    }
    const next = [...profiles, profile];
    setProfiles(next);
    saveProfiles(next);
    setActiveProfile(profile);
    setShowLogin(false);
    setError("");
  };

  /* Delete profile */
  const deleteProfile = (id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    saveProfiles(next);
    if (activeProfile?.id === id) {
      setActiveProfile(null);
      setShowLogin(true);
    }
  };

  /* Switch profile */
  const switchProfile = (p: Profile) => {
    setActiveProfile(p);
    setShowLogin(false);
    setActiveTab("live");
    setActiveCat("");
    setPlayingUrl("");
    setPlayingTitle("");
  };

  /* Logout */
  const logout = () => {
    setActiveProfile(null);
    setShowLogin(true);
    setPlayingUrl("");
    setPlayingTitle("");
    localStorage.removeItem(LS_LAST);
  };

  /* Filtered items */
  const currentStreams = activeTab === "live" ? liveStreams : activeTab === "movies" ? vodStreams : activeTab === "series" ? seriesList : [];
  const filtered = currentStreams.filter((s) => {
    const matchesCat = !activeCat || s.category_id === activeCat;
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });
  const favFiltered = activeTab === "favs" ? currentStreams.filter((s) => favs.includes(String(s.stream_id))) : [];
  const displayItems = activeTab === "favs" ? favFiltered : filtered;

  /* Categories for current tab */
  const currentCats = activeTab === "live" ? liveCats : activeTab === "movies" ? vodCats : activeTab === "series" ? seriesCats : [];

  /* ─── Render ─── */

  if (showLogin || !activeProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] via-[#111] to-[#0a0a0a] p-4">
        <div className="w-full max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center text-white font-bold text-xl">
                NX
              </div>
              <h1 className="text-3xl font-bold text-white">Nexlify WebPlayer</h1>
            </div>
            <p className="text-neutral-400">Stream live TV, movies & series anywhere — your entertainment, your way.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Login card */}
            <div className="bg-[#141414] rounded-2xl border border-white/10 p-6">
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setLoginTab("xtream")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    loginTab === "xtream" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <User size={16} className="inline mr-2" />
                  Xtream Login
                </button>
                <button
                  onClick={() => setLoginTab("m3u")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    loginTab === "m3u" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <LinkIcon size={16} className="inline mr-2" />
                  M3U URL
                </button>
              </div>

              {loginTab === "xtream" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Server URL</label>
                    <input
                      type="url"
                      placeholder="http://example.com:8080"
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={svr}
                      onChange={(e) => setSvr(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Username</label>
                    <input
                      type="text"
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={usr}
                      onChange={(e) => setUsr(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Password</label>
                    <input
                      type="password"
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Profile Name (optional)</label>
                    <input
                      type="text"
                      placeholder="My Playlist"
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">M3U URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/playlist.m3u"
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Profile Name (optional)</label>
                    <input
                      type="text"
                      placeholder="My Playlist"
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Custom User-Agent (optional)</label>
                    <input
                      type="text"
                      placeholder="Mozilla/5.0..."
                      className="mt-1 w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
                      value={m3uUA}
                      onChange={(e) => setM3uUA(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

              <button
                onClick={saveProfile}
                className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-2.5 rounded-lg transition"
              >
                <Play size={16} className="inline mr-2" />
                Sign In & Connect
              </button>
            </div>

            {/* Saved profiles */}
            <div className="bg-[#141414] rounded-2xl border border-white/10 p-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Settings size={16} />
                Saved Profiles
              </h3>
              {profiles.length === 0 ? (
                <p className="text-neutral-500 text-sm">No saved profiles yet. Sign in on the left to create your first profile.</p>
              ) : (
                <div className="space-y-2">
                  {profiles.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[#0a0a0a] border border-white/5 hover:border-white/10 transition group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-purple-400">
                        {p.type === "xtream" ? <User size={14} /> : <LinkIcon size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.name}</p>
                        <p className="text-xs text-neutral-500 truncate">{p.type === "xtream" ? p.server : p.m3uUrl}</p>
                      </div>
                      <button
                        onClick={() => switchProfile(p)}
                        className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                      >
                        Connect
                      </button>
                      <button
                        onClick={() => deleteProfile(p.id)}
                        className="p-1.5 text-neutral-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {[
              { icon: Tv, label: "Live TV, Movies & Series" },
              { icon: CalendarDays, label: "Full EPG & Catch-up TV" },
              { icon: Heart, label: "Favourites, history & search" },
              { icon: Play, label: "Smooth HLS playback" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-neutral-400 text-sm">
                <f.icon size={16} className="text-purple-400 shrink-0" />
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-neutral-600 mt-8">
            © {new Date().getFullYear()} Nexlify. All rights reserved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a] text-white">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } bg-[#141414] border-r border-white/5 flex flex-col transition-all duration-300 overflow-hidden shrink-0`}
      >
        {/* Profile info */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
              NX
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{activeProfile.name}</p>
              <p className="text-xs text-neutral-500 truncate">
                {activeProfile.type === "xtream" ? activeProfile.server : "M3U"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full mt-2 py-1.5 text-xs font-medium text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition flex items-center justify-center gap-1"
          >
            <LogOut size={12} /> Logout
          </button>
        </div>

        {/* Tabs */}
        <div className="p-2 space-y-1">
          {[
            { id: "live" as const, label: "Live TV", icon: Tv },
            { id: "movies" as const, label: "Movies", icon: Film },
            { id: "series" as const, label: "Series", icon: MonitorPlay },
            { id: "favs" as const, label: "Favourites", icon: Star },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                setActiveCat("");
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                activeTab === t.id ? "bg-white/10 text-white font-medium" : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold px-3 py-2">Categories</p>
          <div className="space-y-1">
            <button
              onClick={() => setActiveCat("")}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${
                activeCat === "" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"
              }`}
            >
              All
            </button>
            {currentCats.map((cat) => (
              <button
                key={cat.category_id}
                onClick={() => setActiveCat(cat.category_id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${
                  activeCat === cat.category_id ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {cat.category_name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 p-3 border-b border-white/5 bg-[#141414]/50 backdrop-blur">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition"
          >
            <Menu size={18} />
          </button>

          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search channels..."
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={() => setShowLogin(true)}
            className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition"
            title="Switch profile"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Info size={32} className="text-red-400 mb-2" />
              <p className="text-red-400">{error}</p>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-neutral-500">
              <Tv size={32} className="mb-2" />
              <p>No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {displayItems.map((item) => {
                const id = String(item.stream_id);
                const isFav = favs.includes(id);
                const isPlaying = playingTitle === item.name;
                const epgData = activeTab === "live" && "stream_id" in item ? epg[item.stream_id] : undefined;

                return (
                  <div
                    key={id}
                    className={`group relative bg-[#141414] rounded-xl border border-white/5 hover:border-white/15 transition cursor-pointer overflow-hidden ${
                      isPlaying ? "ring-1 ring-purple-500" : ""
                    }`}
                    onClick={() => playStream(item as any)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-[#0a0a0a] relative overflow-hidden">
                      {(item as any).stream_icon || (item as any).cover || (item as any).logo ? (
                        <img
                          src={(item as any).stream_icon || (item as any).cover || (item as any).logo}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-600">
                          <Tv size={24} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                          <Play size={18} className="text-white ml-0.5" />
                        </div>
                      </div>
                      {/* Live indicator */}
                      {activeTab === "live" && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-500/80 rounded text-[10px] font-bold uppercase tracking-wider text-white">
                          Live
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p className="text-sm font-medium text-white truncate">{item.name}</p>
                      {epgData && epgData[0] && (
                        <p className="text-xs text-neutral-500 truncate mt-0.5">
                          <Clock size={10} className="inline mr-1" />
                          {epgData[0].title}
                        </p>
                      )}
                    </div>

                    {/* Favorite button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFav(id);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-neutral-400 hover:text-pink-400 transition opacity-0 group-hover:opacity-100"
                    >
                      <Heart size={14} fill={isFav ? "currentColor" : "none"} />
                    </button>

                    {/* EPG hover */}
                    {epgData && epgData.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-[#141414]/95 backdrop-blur border-t border-white/5 p-2 translate-y-full group-hover:translate-y-0 transition text-xs">
                        <p className="font-medium text-white mb-1">EPG</p>
                        {epgData.slice(0, 3).map((prog, i) => (
                          <p key={i} className="text-neutral-400 truncate">
                            {prog.start?.slice(11, 16)} - {prog.title}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Player overlay */}
      {playingUrl && (
        <div
          ref={playerRef}
          className={`fixed bg-black z-50 transition-all duration-300 ${
            isFullscreen
              ? "inset-0"
              : "bottom-4 right-4 w-[min(480px,90vw)] rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          }`}
        >
          <div className="relative">
            <video ref={videoRef} className="w-full aspect-video bg-black" controls playsInline />

            {/* Player header */}
            <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
              <p className="text-sm font-medium text-white truncate max-w-[70%]">{playingTitle}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition"
                >
                  {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
                <button
                  onClick={() => {
                    setPlayingUrl("");
                    setPlayingTitle("");
                    if (hlsRef.current) {
                      hlsRef.current.destroy();
                      hlsRef.current = null;
                    }
                  }}
                  className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white transition"
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
