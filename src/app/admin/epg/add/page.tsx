"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EPG_SOURCE_TYPES, resolveEpgUrlTemplate, type EpgSourceType } from "@/lib/epg-source-templates";

export default function AdminEpgAddPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    name: searchParams.get("name") ?? "",
    url: searchParams.get("url") ?? "",
    sourceType: (searchParams.get("type") as EpgSourceType) ?? "xmltv",
    lineupId: "",
    token: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const template = EPG_SOURCE_TYPES.find((t) => t.value === form.sourceType);

  function applyTemplate() {
    const url = resolveEpgUrlTemplate(form.sourceType, {
      LINEUP_ID: form.lineupId,
      TOKEN: form.token,
    });
    setForm({ ...form, url });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/epg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        url: form.url,
        sourceType: form.sourceType,
        config:
          form.sourceType === "schedules_direct"
            ? { LINEUP_ID: form.lineupId, TOKEN: form.token }
            : undefined,
      }),
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
          Generic XMLTV, SchedulesDirect, or WebGrab+Plus output URL.
        </p>
      </div>

      <form
        onSubmit={add}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Source type
          </span>
          <select
            className="w-full rounded border px-3 py-2 bg-transparent panel-select"
            style={{ borderColor: "var(--border)" }}
            value={form.sourceType}
            onChange={(e) =>
              setForm({ ...form, sourceType: e.target.value as EpgSourceType, url: "" })
            }
          >
            {EPG_SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {template && (
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {template.hint}
            </p>
          )}
        </label>

        {form.sourceType === "schedules_direct" && (
          <div className="grid gap-3">
            <label className="block space-y-1">
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Lineup ID
              </span>
              <input
                className="w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={form.lineupId}
                onChange={(e) => setForm({ ...form, lineupId: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                API token
              </span>
              <input
                className="w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="text-sm underline cursor-pointer text-left"
              style={{ color: "var(--accent)" }}
              onClick={applyTemplate}
            >
              Apply URL template
            </button>
          </div>
        )}

        {form.sourceType === "webgrab_plus" && (
          <button
            type="button"
            className="text-sm underline cursor-pointer"
            style={{ color: "var(--accent)" }}
            onClick={() =>
              setForm({
                ...form,
                url: resolveEpgUrlTemplate("webgrab_plus"),
              })
            }
          >
            Use default WebGrab+Plus path template
          </button>
        )}

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
            Feed URL
          </span>
          <input
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder={template?.urlTemplate ?? "https://example.com/epg.xml"}
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
