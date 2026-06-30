"use client";

import { useEffect, useState } from "react";
import {
  VOD_IMPORT_FORMAT_EXAMPLE,
  VOD_EPISODE_IMPORT_EXAMPLE,
} from "@/lib/vod-import-parser";
import { ServerTreePicker } from "@/components/server-tree-picker";

export function ImportForm({
  title,
  description,
  streamType,
  allowM3u = true,
  allowFolder = true,
  allowVodFile = false,
}: {
  title: string;
  description: string;
  streamType: "LIVE" | "MOVIE" | "SERIES";
  allowM3u?: boolean;
  allowFolder?: boolean;
  allowVodFile?: boolean;
}) {
  const defaultTab = allowVodFile ? "vodfile" : allowM3u ? "m3u" : "folder";
  const [tab, setTab] = useState<"m3u" | "folder" | "vodfile">(defaultTab);
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serverId, setServerId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [result, setResult] = useState("");
  const [onDemandDefault, setOnDemandDefault] = useState(false);
  const [serverIds, setServerIds] = useState<string[]>([]);

  const vodExample =
    streamType === "SERIES" ? VOD_EPISODE_IMPORT_EXAMPLE : VOD_IMPORT_FORMAT_EXAMPLE;

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories));
  }, []);

  async function onM3uFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
  }

  async function onVodFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
  }

  async function runImport() {
    setResult("Importing…");
    const endpoint =
      tab === "m3u"
        ? "/api/admin/import/m3u"
        : tab === "vodfile"
          ? "/api/admin/import/vod-file"
          : "/api/admin/import/folder";
    const body =
      tab === "m3u"
        ? {
            content: content || undefined,
            url: url || undefined,
            streamType,
            categoryId: categoryId || null,
            serverId: serverIds[0] || serverId || null,
            defaultOnDemand: streamType === "LIVE" ? onDemandDefault : undefined,
          }
        : tab === "vodfile"
          ? {
              content: content || undefined,
              url: url || undefined,
              streamType,
              categoryId: categoryId || null,
              serverId: serverId || null,
            }
          : {
              path,
              mode: streamType === "SERIES" ? "SERIES" : streamType === "MOVIE" ? "MOVIE" : "MIXED",
              categoryId: categoryId || null,
              serverId: serverId || null,
            };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setResult(
      res.ok
        ? `Imported ${data.imported}, skipped ${data.skipped}${
            data.errors?.length ? ` · ${data.errors.slice(0, 3).join("; ")}` : ""
          }`
        : data.error ?? "Import failed"
    );
  }

  const tabs: { id: typeof tab; label: string; show: boolean }[] = [
    { id: "vodfile", label: "JSON import file", show: allowVodFile },
    { id: "m3u", label: "M3U file / URL", show: allowM3u },
    { id: "folder", label: "Folder scan", show: allowFolder },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>

      {tabs.filter((t) => t.show).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className="text-sm px-3 py-1.5 rounded-md cursor-pointer"
                style={{
                  background: tab === t.id ? "var(--accent)" : "transparent",
                  color: tab === t.id ? "#fff" : "var(--muted)",
                  border: tab === t.id ? "none" : "1px solid var(--border)",
                }}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
        </div>
      )}

      <div
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        {tab === "vodfile" && allowVodFile ? (
          <>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              JSON array or JSONL (one object per line). Each row must include{" "}
              <strong>name</strong> and <strong>source</strong> (URL or path under MEDIA_IMPORT_ROOT).
            </p>
            <pre
              className="text-xs rounded border p-3 overflow-x-auto max-h-40"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              {vodExample}
            </pre>
            <input
              placeholder="Import file URL (optional)"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <textarea
              placeholder="Or paste JSON…"
              className="w-full rounded border px-3 py-2 bg-transparent min-h-[160px] font-mono text-xs"
              style={{ borderColor: "var(--border)" }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <input type="file" accept=".json,.jsonl,.txt,application/json" onChange={onVodFile} />
          </>
        ) : tab === "m3u" && allowM3u ? (
          <>
            <input
              placeholder="M3U URL (optional)"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <textarea
              placeholder="Or paste M3U content…"
              className="w-full rounded border px-3 py-2 bg-transparent min-h-[160px] font-mono text-xs"
              style={{ borderColor: "var(--border)" }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <input type="file" accept=".m3u,.m3u8,text/*" onChange={onM3uFile} />
          </>
        ) : (
          allowFolder && (
            <input
              placeholder="Server folder path e.g. /media/movies"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          )
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <select
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Default category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <ServerTreePicker
          label="Assign to streaming server (tree)"
          selectedIds={serverIds.length ? serverIds : serverId ? [serverId] : []}
          onChange={(ids) => {
            setServerIds(ids);
            setServerId(ids[0] ?? "");
          }}
        />

        {streamType === "LIVE" && tab === "m3u" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={onDemandDefault}
              onChange={(e) => setOnDemandDefault(e.target.checked)}
            />
            <span>
              Import channels as <strong>on demand</strong> (recommended — saves bandwidth)
            </span>
          </label>
        )}

        <button
          type="button"
          onClick={runImport}
          className="rounded py-2 px-4 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Start import
        </button>
        {result && <p className="text-sm">{result}</p>}
      </div>
    </div>
  );
}
