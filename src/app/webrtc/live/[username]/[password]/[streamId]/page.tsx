"use client";

import { use, useEffect, useState } from "react";
import { WebRtcPlayer } from "@/components/webrtc-player";

export default function WebRtcLivePage({
  params,
}: {
  params: Promise<{ username: string; password: string; streamId: string }>;
}) {
  const { username, password, streamId } = use(params);
  const [streamName, setStreamName] = useState("");
  const [fallbackHls, setFallbackHls] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const origin = window.location.origin.replace(/\/+$/, "");

    fetch("/api/webrtc/ice")
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled === false) setEnabled(false);
      })
      .catch(() => {});

    fetch(
      `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`
    )
      .then((r) => r.json())
      .then((streams) => {
        const list = Array.isArray(streams) ? streams : [];
        const match = list.find((s: { stream_id?: string; num?: string; name?: string }) =>
          String(s.stream_id ?? s.num) === streamId
        );
        if (match?.name) setStreamName(String(match.name));
      })
      .catch(() => {});

    setFallbackHls(
      `${origin}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(streamId)}.m3u8`
    );
  }, [username, password, streamId]);

  if (!enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0e14] text-white">
        <p>WebRTC is not enabled on this panel. Contact your provider.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "#0a0e14", color: "#fff" }}>
      <div className="max-w-4xl mx-auto space-y-4">
        <header>
          <p className="text-xs uppercase tracking-wide opacity-60">Nexlify WebRTC Player</p>
          <h1 className="text-xl font-semibold">{streamName || `Channel ${streamId}`}</h1>
          <p className="text-sm opacity-70 mt-1">Ultra-low latency live via WHEP · ~1–3s glass-to-glass</p>
        </header>
        <WebRtcPlayer
          username={username}
          password={password}
          streamId={streamId}
          streamName={streamName}
          fallbackHlsUrl={fallbackHls}
          autoPlay
        />
      </div>
    </div>
  );
}
