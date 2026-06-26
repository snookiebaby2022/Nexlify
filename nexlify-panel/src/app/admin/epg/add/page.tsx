"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AdminEpgAddPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    name: searchParams.get("name") ?? "",
    url: searchParams.get("url") ?? "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/epg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to add EPG source");
      return;
    }
    router.push("/admin/epg/sources");
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold">Add EPG source</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          XMLTV URL (`.xml` or `.xml.gz`). Sync from{" "}
          <Link href="/admin/epg/sources" className="underline">
            EPG Sources
          </Link>{" "}
          after adding.
        </p>
      </div>

      <form
        onSubmit={add}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Source name
          </span>
          <input
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. UK EPG"
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            XMLTV URL
          </span>
          <input
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://example.com/epg.xml"
            required
          />
        </label>
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded py-2 px-4 font-medium cursor-pointer disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "Saving…" : "Add EPG source"}
          </button>
          <Link
            href="/admin/epg/sources"
            className="rounded py-2 px-4 text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
