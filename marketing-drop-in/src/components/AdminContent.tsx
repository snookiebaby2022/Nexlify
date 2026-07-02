"use client";

import { useCallback, useEffect, useState } from "react";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  tag: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string | null;
  published: boolean;
  datePublished: string;
  updatedAt: string;
};

const EMPTY: BlogPost = { id: "", slug: "", title: "", excerpt: "", content: "", tag: null, seoTitle: null, seoDescription: null, keywords: null, published: false, datePublished: "", updatedAt: "" };

export function AdminContent() {
  const [posts, setPosts] = useState<{ id: string; slug: string; title: string; tag: string | null; published: boolean; datePublished: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<BlogPost>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/content")
      .then((r) => r.json())
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => { setEditing(null); setForm(EMPTY); setMsg(""); };
  const startEdit = (p: { id: string }) => {
    fetch(`/api/admin/content?id=${p.id}`)
      .then((r) => r.json())
      .then((data) => { setEditing(data); setForm(data); setMsg(""); });
  };

  const save = useCallback(async () => {
    setSaving(true);
    setMsg("");
    const isNew = !editing;
    const res = await fetch("/api/admin/content", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? form : { id: editing.id, ...form }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.error) { setMsg(`Error: ${data.error}`); return; }
    setMsg(isNew ? "Post created!" : "Post updated!");
    setEditing(null);
    setForm(EMPTY);
    load();
  }, [editing, form, load]);

  const del = useCallback(async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/admin/content?id=${id}`, { method: "DELETE" });
    load();
  }, [load]);

  const update = (key: keyof BlogPost, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const u = (key: keyof BlogPost) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, e.target.value);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">Blog Posts</h2>
        <button onClick={startCreate} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">+ New Post</button>
      </div>

      {msg && <p className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("Error") ? "text-amber-400 bg-amber-500/10" : "text-green-400 bg-green-500/10"}`}>{msg}</p>}

      {(editing || form.id === "") && (
        <section className="glass rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-white">{editing ? "Edit Post" : "New Post"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" value={form.slug} onChange={u("slug")} placeholder="my-blog-post" />
            <Field label="Title" value={form.title} onChange={u("title")} placeholder="How to set up IPTV" />
            <Field label="Tag" value={form.tag || ""} onChange={u("tag")} placeholder="guide" />
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.published} onChange={(e) => update("published", e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500" />
                Published
              </label>
            </div>
          </div>
          <Field label="Excerpt" value={form.excerpt} onChange={u("excerpt")} placeholder="Short summary for listing page" />
          <div>
            <label className="block text-sm text-slate-300">Content (HTML)</label>
            <textarea value={form.content} onChange={u("content")} rows={12}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:border-violet-500 focus:outline-none min-h-[200px]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SEO Title" value={form.seoTitle || ""} onChange={u("seoTitle")} placeholder="Override page title" />
            <Field label="SEO Description" value={form.seoDescription || ""} onChange={u("seoDescription")} placeholder="Meta description" />
          </div>
          <Field label="Keywords" value={form.keywords || ""} onChange={u("keywords")} placeholder="iptv, reseller, panel" />
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </button>
            <button onClick={() => { setEditing(null); setForm(EMPTY); setMsg(""); }} className="rounded-lg border border-slate-700 px-5 py-2 text-sm text-slate-300 hover:text-white">Cancel</button>
          </div>
        </section>
      )}

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-white font-medium">{p.title}</td>
                  <td className="px-4 py-3 text-cyan-300">/{p.slug}</td>
                  <td className="px-4 py-3 text-slate-400">{p.tag || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={p.published ? "text-green-400" : "text-amber-400"}>
                      {p.published ? "published" : "draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(p.datePublished).toLocaleDateString()}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => startEdit(p)} className="text-xs text-violet-400 hover:text-violet-300">Edit</button>
                    <button onClick={() => del(p.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
              {!posts.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No posts yet. Create your first blog post above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm text-slate-300">{label}</label>
      <input value={value} onChange={onChange} placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none" />
    </div>
  );
}
