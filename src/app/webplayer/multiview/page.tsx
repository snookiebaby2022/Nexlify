"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { attachUrlToVideo } from "@/lib/browser-stream-player";

type LiveStream = { stream_id: string; name: string; stream_icon?: string };

function MultiviewInner() {
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get("username") ?? "");
  const [password, setPassword] = useState(params.get("password") ?? "");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [cols, setCols] = useState(2);
  const [picked, setPicked] = useState<string[]>([]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const res = await fetch(`/player_api.php?${q}&action=get_live_streams`);
    if (!res.ok) {
      setError("Login failed");
      return;
    }
    const data = (await res.json()) as LiveStream[];
    setStreams(Array.isArray(data) ? data.slice(0, 400) : []);
    setLoggedIn(true);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const max = cols * cols;
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

  const cells = picked.slice(0, cols * cols);

  return (
    <div className="min-h-screen bg-black text-white p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Multi-view</h1>
        <label className="text-xs text-neutral-400">
          Grid{" "}
          <select
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          >
            <option value={2}>2×2</option>
            <option value={3}>3×3</option>
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
  const play = useCallback(async () => {
    handleRef.current?.destroy();
    handleRef.current = null;
    if (!streamId || !videoRef.current) return;
    const url = `${window.location.origin}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.m3u8`;
    handleRef.current = await attachUrlToVideo(videoRef.current, url, () => {});
  }, [username, password, streamId]);

  useEffect(() => {
    void play();
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [play]);

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

export default function MultiviewPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-neutral-400">Loading…</p>}>
      <MultiviewInner />
    </Suspense>
  );
}
