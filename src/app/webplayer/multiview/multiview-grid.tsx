"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { attachUrlToVideo } from "@/lib/browser-stream-player";

type LiveStream = { stream_id: string; name: string; stream_icon?: string };

const MAX_CONCURRENT_PLAYERS = 4;

function stripCredsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("username") && !url.searchParams.has("password") && !url.searchParams.has("t")) {
    return;
  }
  url.searchParams.delete("username");
  url.searchParams.delete("password");
  url.searchParams.delete("t");
  const qs = url.searchParams.toString();
  window.history.replaceState(null, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
}

function MultiviewInner() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [cols, setCols] = useState(2);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const t = params.get("t");
    const u = params.get("username");
    const p = params.get("password");
    if (t) {
      void (async () => {
        try {
          const res = await fetch(`/api/webplayer/credentials?t=${encodeURIComponent(t)}`, {
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as {
            username?: string;
            password?: string;
            error?: string;
          };
          if (!res.ok || !data.username || !data.password) {
            setError(data.error || "Invalid or expired player link");
            stripCredsFromUrl();
            return;
          }
          setUsername(data.username);
          setPassword(data.password);
          stripCredsFromUrl();
        } catch {
          setError("Could not open player link");
          stripCredsFromUrl();
        }
      })();
      return;
    }
    if (u && p) {
      setUsername(u);
      setPassword(p);
      stripCredsFromUrl();
    }
  }, [params]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const res = await fetch(`/player_api.php?${q}&action=get_live_streams`);
    if (!res.ok) {
      setError("Login failed");
      return;
    }
    const data = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(data)) {
      const authFail =
        data &&
        typeof data === "object" &&
        (data as { user_info?: { auth?: number; message?: string } }).user_info?.auth === 0;
      setError(
        authFail
          ? String((data as { user_info?: { message?: string } }).user_info?.message || "Login failed")
          : "Login failed"
      );
      return;
    }
    setStreams(data.slice(0, 400) as LiveStream[]);
    setLoggedIn(true);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const max = Math.min(cols * cols, MAX_CONCURRENT_PLAYERS);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  if (!loggedIn) {
    return (
      <form onSubmit={login} className="max-w-sm mx-auto p-8 space-y-3 text-white">
        <h1 className="text-lg font-semibold">Multi-view player</h1>
        <p className="text-sm text-neutral-400">Watch several live channels at once (1-Stream style).</p>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <input
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="w-full rounded bg-sky-600 py-2 text-sm">
          Open grid
        </button>
      </form>
    );
  }

  const cells = picked.slice(0, Math.min(cols * cols, MAX_CONCURRENT_PLAYERS));

  return (
    <div className="min-h-screen bg-black text-white p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Multi-view</h1>
        <label className="text-xs text-neutral-400">
          Grid{" "}
          <select
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            value={cols}
            onChange={(e) => {
              const next = Number(e.target.value);
              setCols(next);
              setPicked((prev) => prev.slice(0, Math.min(next * next, MAX_CONCURRENT_PLAYERS)));
            }}
          >
            <option value={2}>2×2</option>
            <option value={3}>3×3 (max 4 playing)</option>
          </select>
        </label>
        <a href="/webplayer" className="text-xs text-sky-400">
          Single player
        </a>
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols * cols }).map((_, i) => (
          <MultiviewCell
            key={cells[i] ?? `empty-${i}`}
            username={username}
            password={password}
            streamId={cells[i]}
            title={streams.find((s) => s.stream_id === cells[i])?.name}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 max-h-48 overflow-auto">
        {streams.map((s) => (
          <button
            key={s.stream_id}
            type="button"
            onClick={() => toggle(s.stream_id)}
            className="text-xs rounded px-2 py-1 border"
            style={{
              borderColor: picked.includes(s.stream_id) ? "#38bdf8" : "#333",
              background: picked.includes(s.stream_id) ? "rgba(56,189,248,0.2)" : "transparent",
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiviewCell({
  username,
  password,
  streamId,
  title,
}: {
  username: string;
  password: string;
  streamId?: string;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<{ destroy: () => void } | null>(null);
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;
    let cancelled = false;

    void (async () => {
      handleRef.current?.destroy();
      handleRef.current = null;
      if (!streamId || !videoRef.current) return;
      const url = `${window.location.origin}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.m3u8`;
      try {
        const handle = await attachUrlToVideo(videoRef.current, url, () => {});
        if (cancelled || gen !== genRef.current) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
      } catch {
        /* attach failed */
      }
    })();

    return () => {
      cancelled = true;
      genRef.current += 1;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [username, password, streamId]);

  return (
    <div className="relative bg-neutral-950 aspect-video rounded overflow-hidden border border-neutral-800">
      {streamId ? (
        <video ref={videoRef} className="w-full h-full object-contain" muted playsInline autoPlay />
      ) : (
        <div className="flex items-center justify-center h-full text-xs text-neutral-500">Pick a channel</div>
      )}
      {title ? (
        <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 px-1.5 py-0.5 rounded">{title}</span>
      ) : null}
    </div>
  );
}

export default function MultiviewGrid() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-neutral-400">Loading…</p>}>
      <MultiviewInner />
    </Suspense>
  );
}
