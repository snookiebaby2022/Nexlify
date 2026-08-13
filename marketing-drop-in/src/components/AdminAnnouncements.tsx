"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
  active: boolean;
  createdAt: string;
};

export function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: "", message: "", type: "info", active: true });
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements");
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setError("");
    if (!form.title.trim() || !form.message.trim()) {
      setError("Title and message are required");
      return;
    }
    setLoading(true);
    try {
      const method = editing ? "PUT" : "POST";
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch("/api/admin/announcements", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setShowForm(false);
      setEditing(null);
      setForm({ title: "", message: "", type: "info", active: true });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (a: Announcement) => {
    await fetch("/api/admin/announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, active: !a.active }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await fetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
    load();
  };

  const edit = (a: Announcement) => {
    setForm({ title: a.title, message: a.message, type: a.type, active: a.active });
    setEditing(a);
    setShowForm(true);
  };

  const TYPE_COLORS: Record<string, string> = {
    info: "bg-blue-500/20 text-blue-300",
    warning: "bg-yellow-500/20 text-yellow-300",
    success: "bg-green-500/20 text-green-300",
    error: "bg-red-500/20 text-red-300",
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <span className="text-sm text-[var(--muted)]">{announcements.length} announcement(s)</span>
        <button
          onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ title: "", message: "", type: "info", active: true }); }}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Plus size={12} /> New
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold">{editing ? "Edit Announcement" : "New Announcement"}</h3>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title"
            className="w-full px-3 py-2 rounded border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          />
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Message (supports basic HTML)"
            rows={3}
            className="w-full px-3 py-2 rounded border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          />
          <div className="flex gap-3 items-center">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 rounded border text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded accent-color-violet-500"
              />
              Active
            </label>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>
              {loading ? "Saving..." : "Save"}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {announcements.map((a) => (
          <div key={a.id} className="rounded-xl border p-4 flex items-start justify-between gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)", opacity: a.active ? 1 : 0.5 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLORS[a.type] ?? TYPE_COLORS.info}`}>
                  {a.type}
                </span>
                <span className="text-sm font-medium text-white truncate">{a.title}</span>
              </div>
              <p className="text-xs text-[var(--muted)] truncate">{a.message}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => toggle(a)} className="p-1.5 rounded hover:bg-white/5" title={a.active ? "Deactivate" : "Activate"}>
                {a.active ? <Eye size={14} className="text-green-400" /> : <EyeOff size={14} className="text-gray-500" />}
              </button>
              <button onClick={() => edit(a)} className="p-1.5 rounded hover:bg-white/5 text-[var(--muted)]" title="Edit">Edit</button>
              <button onClick={() => remove(a.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {!announcements.length && !loading && (
          <p className="text-sm text-center py-8 text-[var(--muted)]">No announcements yet. Click "New" to create one.</p>
        )}
      </div>
    </div>
  );
}
