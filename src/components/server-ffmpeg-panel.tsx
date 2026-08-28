"use client";

import { useCallback, useEffect, useState } from "react";

export function ServerFfmpegPanel({ serverId }: { serverId: string }) {
  const [edgeFfmpegEnabled, setEdgeFfmpegEnabled] = useState(true);
  const [transcodeProfileId, setTranscodeProfileId] = useState("");
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/servers/${serverId}/panel-settings`)
      .then((r) => r.json())
      .then((d) => {
        const perf = d?.settings?.performance ?? {};
        setEdgeFfmpegEnabled(perf.edgeFfmpegEnabled !== false);
        setTranscodeProfileId(String(perf.transcodeProfileId ?? ""));
      });
    fetch("/api/admin/transcoding-profiles")
      .then((r) => r.json())
      .then((d) => setProfiles(Array.isArray(d.profiles) ? d.profiles : []));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg("");
    const res = await fetch(`/api/admin/servers/${serverId}/panel-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        performance: {
          edgeFfmpegEnabled,
          transcodeProfileId: transcodeProfileId || null,
        },
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "Save failed");
      return;
    }
    setMsg("Saved — push config from Agent panel to apply on node.");
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3 text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <h3 className="font-medium">Local ffmpeg (stream node)</h3>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        XUI-style on-node transcoding/restream. Edge proxy and stream agent spawn ffmpeg locally
        for HLS packaging and on-demand channels.
      </p>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={edgeFfmpegEnabled}
          onChange={(e) => setEdgeFfmpegEnabled(e.target.checked)}
        />
        Enable local ffmpeg on this server
      </label>
      <label className="block space-y-1">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Transcoding profile (720p / 540p ladder)
        </span>
        <select
          className="w-full rounded border px-2 py-1.5 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          value={transcodeProfileId}
          onChange={(e) => setTranscodeProfileId(e.target.value)}
        >
          <option value="">Panel default</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="text-xs px-3 py-1.5 rounded cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff" }}
        onClick={() => save()}
      >
        Save ffmpeg settings
      </button>
      {msg ? <p className="text-xs">{msg}</p> : null}
    </div>
  );
}
