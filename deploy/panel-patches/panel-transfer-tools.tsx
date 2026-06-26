"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SECTIONS = [
  { id: "lines", label: "Lines / subscriptions" },
  { id: "streams", label: "Streams" },
  { id: "bouquets", label: "Bouquets / packages" },
  { id: "resellers", label: "Resellers & sub-resellers" },
  { id: "providers", label: "Stream providers" },
] as const;

export function PanelTransferTools() {
  const [tab, setTab] = useState<"export" | "import">("export");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["lines", "streams", "bouquets"])
  );
  const [importJson, setImportJson] = useState("");
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [importLines, setImportLines] = useState(true);
  const [importStreams, setImportStreams] = useState(true);
  const [importBouquets, setImportBouquets] = useState(true);
  const [importResellers, setImportResellers] = useState(false);
  const [importProviders, setImportProviders] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, []);

  function toggleSection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runExport(download: boolean) {
    setStatus("Exporting…");
    const sections = [...selected].join(",");
    const url = `/api/admin/panel-transfer/export?sections=${encodeURIComponent(sections)}${download ? "&download=1" : ""}`;
    if (download) {
      window.location.href = url;
      setStatus("Download started.");
      return;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      setStatus(`Error: ${data.error ?? res.statusText}`);
      return;
    }
    const p = data.preview;
    setPreview(
      `Ready: ${p.bouquets} bouquets, ${p.streams} streams, ${p.lines} lines, ${p.resellers} resellers, ${p.providers} providers`
    );
    setStatus("Export preview loaded — use Download JSON to save the file.");
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportJson(await file.text());
  }

  async function runImport(dryRun: boolean) {
    if (!importJson.trim()) {
      setStatus("Paste or upload a Nexlify transfer JSON file first.");
      return;
    }
    setStatus(dryRun ? "Previewing…" : "Importing…");
    setPreview("");
    let bundle: unknown;
    try {
      bundle = JSON.parse(importJson);
    } catch {
      setStatus("Invalid JSON file.");
      return;
    }
    const res = await fetch("/api/admin/panel-transfer/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundle,
        dryRun,
        importLines,
        importStreams,
        importBouquets,
        importResellers,
        importProviders,
        skipExistingLines: skipExisting,
        skipExistingStreams: skipExisting,
        skipExistingResellers: skipExisting,
        defaultServerId: serverId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(`Error: ${data.error ?? res.statusText}`);
      return;
    }
    const c = data.preview?.counts;
    setPreview(
      c
        ? `Found: ${c.bouquets} bouquets, ${c.streams} streams, ${c.lines} lines, ${c.resellers} resellers, ${c.providers} providers`
        : ""
    );
    if (dryRun) {
      setStatus("Preview complete — review counts, then run import.");
      return;
    }
    const r = data.result;
    if (r) {
      const lines = [
        `Bouquets: +${r.bouquets.imported} / skipped ${r.bouquets.skipped}`,
        `Streams: +${r.streams.imported} / updated ${r.streams.updated} / skipped ${r.streams.skipped}`,
        `Lines: +${r.lines.imported} / skipped ${r.lines.skipped}`,
        r.resellers
          ? `Resellers: +${r.resellers.imported} / skipped ${r.resellers.skipped}`
          : null,
        `Providers: +${r.providers.imported} / skipped ${r.providers.skipped}`,
        r.generatedPasswords?.length
          ? `New reseller passwords generated: ${r.generatedPasswords.map((p: { username: string; password: string }) => `${p.username}=${p.password}`).join(", ")}`
          : null,
        r.warnings?.length ? `Warnings: ${r.warnings.slice(0, 5).join("; ")}` : null,
      ].filter(Boolean);
      setStatus(lines.join("\n"));
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm opacity-80">
        Move data between Nexlify panels using JSON export/import. For XUI, 1-stream, or other
        panels use{" "}
        <Link href="/admin/import/migrate" style={{ color: "var(--accent)" }}>
          Panel Migration
        </Link>
        .
      </p>

      <div className="flex gap-2 text-sm">
        {(["export", "import"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="px-3 py-1.5 rounded capitalize"
            style={{
              background: tab === t ? "var(--accent)" : "var(--card)",
              color: tab === t ? "#fff" : "inherit",
              border: "1px solid var(--border)",
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "export" ? (
        <div className="space-y-4 text-sm">
          <p className="opacity-70">Select what to include in the export file.</p>
          <div className="flex flex-wrap gap-4">
            {SECTIONS.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleSection(s.id)}
                />{" "}
                {s.label}
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              onClick={() => runExport(false)}
            >
              Preview counts
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => runExport(true)}
              disabled={selected.size === 0}
            >
              Download JSON
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <label className="block">
            Transfer JSON file
            <input type="file" accept=".json" className="mt-1 block" onChange={onImportFile} />
            <textarea
              className="mt-2 w-full min-h-[160px] rounded px-3 py-2 font-mono text-xs"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste Nexlify transfer JSON…"
            />
          </label>

          <label className="block">
            Default stream server (optional)
            <select
              className="mt-1 w-full rounded px-3 py-2"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
            >
              <option value="">— none —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-4">
            <label>
              <input type="checkbox" checked={importBouquets} onChange={(e) => setImportBouquets(e.target.checked)} /> Bouquets
            </label>
            <label>
              <input type="checkbox" checked={importStreams} onChange={(e) => setImportStreams(e.target.checked)} /> Streams
            </label>
            <label>
              <input type="checkbox" checked={importLines} onChange={(e) => setImportLines(e.target.checked)} /> Lines
            </label>
            <label>
              <input type="checkbox" checked={importResellers} onChange={(e) => setImportResellers(e.target.checked)} /> Resellers
            </label>
            <label>
              <input type="checkbox" checked={importProviders} onChange={(e) => setImportProviders(e.target.checked)} /> Providers
            </label>
            <label>
              <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} /> Skip existing
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              onClick={() => runImport(true)}
            >
              Preview
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => runImport(false)}
            >
              Run import
            </button>
          </div>
        </div>
      )}

      {preview && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--accent)" }}>
          {preview}
        </p>
      )}
      {status && (
        <pre
          className="text-sm whitespace-pre-wrap rounded p-3"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {status}
        </pre>
      )}
    </div>
  );
}
