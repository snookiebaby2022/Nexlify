"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, Monitor } from "lucide-react";

type TranscodingProfile = {
  id: string;
  name: string;
  resolution: string;
  bitrate: number;
  codec: string;
  gpuAcceleration: boolean;
  isActive: boolean;
};

export default function TranscodingProfilesPage() {
  const [profiles, setProfiles] = useState<TranscodingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", resolution: "1920x1080", bitrate: 5000, codec: "h264", gpuAcceleration: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/transcoding-profiles");
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name) return;
    setLoading(true);
    try {
      await fetch("/api/admin/transcoding-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      setForm({ name: "", resolution: "1920x1080", bitrate: 5000, codec: "h264", gpuAcceleration: false });
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (profileId: string) => {
    if (!confirm("Delete this profile?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/transcoding-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", profileId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transcoding Profiles</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> New Profile
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Transcoding Profile</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Profile name" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input value={form.resolution} onChange={e => setForm(p => ({ ...p, resolution: e.target.value }))} placeholder="Resolution" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input type="number" value={form.bitrate} onChange={e => setForm(p => ({ ...p, bitrate: +e.target.value }))} placeholder="Bitrate (kbps)" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <select value={form.codec} onChange={e => setForm(p => ({ ...p, codec: e.target.value }))} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <option value="h264">H.264</option>
              <option value="h265">H.265</option>
              <option value="vp9">VP9</option>
              <option value="av1">AV1</option>
            </select>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.gpuAcceleration} onChange={e => setForm(p => ({ ...p, gpuAcceleration: e.target.checked }))} />
              GPU Acceleration
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Create</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map(p => (
          <div key={p.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <Monitor size={24} style={{ color: "var(--accent)" }} />
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{p.resolution} @ {p.bitrate}kbps</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-white/5">{p.codec.toUpperCase()}</span>
                {p.gpuAcceleration && <span className="text-xs px-2 py-0.5 rounded bg-green-900/30 text-green-400">GPU</span>}
              </div>
              <button onClick={() => remove(p.id)} className="p-1 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {!profiles.length && (
          <div className="col-span-full text-center py-12" style={{ color: "var(--muted)" }}>No transcoding profiles configured</div>
        )}
      </div>
    </div>
  );
}
