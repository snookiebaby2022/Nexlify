"use client";

import { useState } from "react";
import { Play, Square } from "lucide-react";
import { FFMPEG_TRANSCODE_PROFILES } from "@/lib/ffmpeg-transcode-profiles";

export function StreamTranscodeQuickActions({
  streamId,
  serverId,
  playbackStatus,
  onRefresh,
}: {
  streamId: string;
  serverId?: string | null;
  playbackStatus?: string | null;
  onRefresh: () => void;
}) {
  const [profile, setProfile] = useState("none");
  const [busy, setBusy] = useState(false);

  if (!serverId) return null;

  async function agentAction(action: "start_stream" | "stop_stream" | "restart_stream") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/servers/${serverId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, streamId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Agent command failed");
      } else {
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(next: string) {
    setProfile(next);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/streams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: streamId, transcodeProfile: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Profile update failed");
      } else if (next !== "none") {
        await agentAction("restart_stream");
      } else {
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const running = playbackStatus === "online" || playbackStatus === "transcode";

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <select
        className="xui-streams-filter-select text-[10px] py-0.5 max-w-[7rem]"
        value={profile}
        disabled={busy}
        onChange={(e) => void saveProfile(e.target.value)}
        title="Transcode profile"
        aria-label="Transcode profile"
      >
        <option value="none">Copy</option>
        {FFMPEG_TRANSCODE_PROFILES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="xui-lines-action-btn p-1"
        disabled={busy}
        title={running ? "Stop transcode" : "Start transcode"}
        aria-label={running ? "Stop transcode" : "Start transcode"}
        onClick={() => void agentAction(running ? "stop_stream" : "start_stream")}
      >
        {running ? <Square size={12} /> : <Play size={12} />}
      </button>
    </div>
  );
}
