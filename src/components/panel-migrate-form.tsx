"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SOURCE_OPTIONS = [
  { id: "xui", label: "XUI.one" },
  { id: "onestream", label: "1-stream" },
  { id: "xtream_ui", label: "Xtream UI" },
  { id: "midnight", label: "Midnight Streamers" },
  { id: "nexlify_json", label: "Nexlify JSON" },
] as const;

type InputMode = "file" | "postgres";

/** SQL/JSON pasted or previewed in the textarea — keep small to avoid browser OOM. */
const MAX_INLINE_BYTES = 512 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PanelMigrateForm() {
  const [source, setSource] = useState<string>("onestream");
  const [inputMode, setInputMode] = useState<InputMode>("postgres");
  const [format, setFormat] = useState<"sql" | "json">("sql");
  const [content, setContent] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pgUrl, setPgUrl] = useState("");
  const [pgHost, setPgHost] = useState("");
  const [pgPort, setPgPort] = useState("5432");
  const [pgDatabase, setPgDatabase] = useState("");
  const [pgUser, setPgUser] = useState("");
  const [pgPassword, setPgPassword] = useState("");
  const [pgSchema, setPgSchema] = useState("");
  const [pgSsl, setPgSsl] = useState(false);
  const [probeInfo, setProbeInfo] = useState("");
  const [serverId, setServerId] = useState("");
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [importBouquets, setImportBouquets] = useState(true);
  const [importStreams, setImportStreams] = useState(true);
  const [importLines, setImportLines] = useState(true);
  const [importResellers, setImportResellers] = useState(true);
  const [importMag, setImportMag] = useState(true);
  const [importEnigma, setImportEnigma] = useState(true);
  const [importCategories, setImportCategories] = useState(true);
  const [importServers, setImportServers] = useState(true);
  const [importEpg, setImportEpg] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);

  const isOneStream = source === "onestream";
  const usePostgres = isOneStream && inputMode === "postgres";

  useEffect(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, []);

  useEffect(() => {
    if (source === "nexlify_json") setFormat("json");
    if (source === "onestream") setInputMode("postgres");
    else setInputMode("file");
  }, [source]);

  function pgConfig() {
    if (pgUrl.trim()) {
      return { connectionString: pgUrl.trim(), ssl: pgSsl, schema: pgSchema.trim() || undefined };
    }
    return {
      host: pgHost.trim() || "127.0.0.1",
      port: Number(pgPort) || 5432,
      database: pgDatabase.trim(),
      user: pgUser.trim(),
      password: pgPassword,
      ssl: pgSsl,
      schema: pgSchema.trim() || undefined,
    };
  }

  function canRun() {
    if (usePostgres) {
      return Boolean(pgUrl.trim() || (pgDatabase.trim() && pgUser.trim()));
    }
    return Boolean(uploadFile || content.trim());
  }

  function migrationPayload(dryRun: boolean) {
    return {
      source,
      dryRun,
      importBouquets,
      importStreams,
      importLines,
      importResellers,
      importMag,
      importEnigma,
      importCategories,
      importServers,
      importEpg,
      skipExistingLines: skipExisting,
      skipExistingStreams: skipExisting,
      defaultServerId: serverId || null,
      format,
    };
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setContent("");
    if (file.name.endsWith(".json")) setFormat("json");
    else if (file.name.endsWith(".sql")) setFormat("sql");
    if (file.size <= MAX_INLINE_BYTES) {
      setContent(await file.text());
    }
  }

  function clearUpload() {
    setUploadFile(null);
    setContent("");
  }

  async function testConnection() {
    setProbeInfo("Connecting…");
    const res = await fetch("/api/admin/migrate/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pg: pgConfig() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setProbeInfo(`Error: ${data.error ?? res.statusText}`);
      return;
    }
    const m = data.probe?.mapping ?? {};
    const lines = Object.entries(m)
      .map(([k, v]) => {
        const ref = v as { schema?: string; table?: string; rowCount?: number };
        return `${k}: ${ref.schema}.${ref.table} (${ref.rowCount ?? "?"} rows)`;
      })
      .join("\n");
    setProbeInfo(
      lines
        ? `Connected. Auto-mapped tables:\n${lines}`
        : "Connected but no tables matched — try setting schema or use SQL export."
    );
  }

  async function run(dryRun: boolean) {
    setResult(dryRun ? "Scanning…" : "Importing…");
    setPreview("");
    setProgress(null);
    setUploadProgress(null);
    setShowAllWarnings(false);

    let res: Response;
    if (usePostgres) {
      const payload: Record<string, unknown> = {
        ...migrationPayload(dryRun),
        format: "postgres",
        pg: pgConfig(),
      };
      res = await fetch("/api/admin/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else if (uploadFile && uploadFile.size > MAX_INLINE_BYTES) {
      // Use XMLHttpRequest for upload progress on large files
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("payload", JSON.stringify(migrationPayload(dryRun)));

      res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/migrate");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress({ loaded: e.loaded, total: e.total });
          }
        };
        xhr.onload = () => {
          const body = xhr.responseText;
          resolve(new Response(body, {
            status: xhr.status,
            headers: { "Content-Type": xhr.getResponseHeader("Content-Type") || "application/json" },
          }));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(form);
      });
      setUploadProgress(null);
    } else {
      const payload: Record<string, unknown> = {
        ...migrationPayload(dryRun),
        format,
        content,
      };
      res = await fetch("/api/admin/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    // For dry runs, parse JSON response directly
    if (dryRun) {
      const data = await res.json();
      if (!res.ok) {
        setResult(`Error: ${data.error ?? res.statusText}`);
        return;
      }
      handlePreviewResponse(data);
      return;
    }

    // For actual imports, read SSE stream
    if (!res.ok) {
      const data = await res.json();
      setResult(`Error: ${data.error ?? res.statusText}`);
      return;
    }

    if (!res.body) {
      setResult("Error: No response body");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const eventType = line.slice(7).trim();
            // Look for the next data line
            const dataIdx = lines.indexOf(line);
            if (dataIdx + 1 < lines.length && lines[dataIdx + 1].startsWith("data: ")) {
              const dataStr = lines[dataIdx + 1].slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (eventType === "progress") {
                  setProgress(data);
                  setResult(`Importing ${data.phase}: ${data.current}/${data.total}...`);
                } else if (eventType === "complete") {
                  handleCompleteResponse(data);
                } else if (eventType === "error") {
                  setResult(`Error: ${data.error}`);
                }
              } catch {
                // Skip malformed data
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  function handlePreviewResponse(data: Record<string, unknown>) {
    const probe = data.probe as Record<string, unknown> | undefined;
    if (probe?.mapping) {
      const mapped = Object.keys(probe.mapping as Record<string, unknown>).join(", ");
      setProbeInfo((prev) => (prev ? prev : `Mapped: ${mapped}`));
    }

    const preview = data.preview as Record<string, unknown> | undefined;
    const c = preview?.counts as Record<string, number> | undefined;
    const parseWarnings = (preview?.warnings as string[]) ?? [];

    setPreview(
      c
        ? [
            `${c.bouquets} bouquets`,
            `${c.streams} streams`,
            `${c.lines} lines`,
            `${c.resellers} resellers`,
            `${c.magDevices} MAG`,
            `${c.enigmaDevices} Enigma`,
            c.categories ? `${c.categories} categories` : null,
            c.servers ? `${c.servers} servers` : null,
            c.epgSources ? `${c.epgSources} EPG sources` : null,
          ]
            .filter(Boolean)
            .join(", ")
        : ""
    );

    if (parseWarnings.length) {
      setResult(`Preview complete.\n\nParse warnings:\n${parseWarnings.map((w) => `  - ${w}`).join("\n")}`);
    } else {
      setResult("Preview complete — review counts, then run import.");
    }
  }

  function handleCompleteResponse(data: Record<string, unknown>) {
    const probe = data.probe as Record<string, unknown> | undefined;
    if (probe?.mapping) {
      const mapped = Object.keys(probe.mapping as Record<string, unknown>).join(", ");
      setProbeInfo((prev) => (prev ? prev : `Mapped: ${mapped}`));
    }

    const c = (data.preview as Record<string, unknown>)?.counts as Record<string, number> | undefined;
    setPreview(
      c
        ? [
            `${c.bouquets} bouquets`,
            `${c.streams} streams`,
            `${c.lines} lines`,
            `${c.resellers} resellers`,
            `${c.magDevices} MAG`,
            `${c.enigmaDevices} Enigma`,
            c.categories ? `${c.categories} categories` : null,
            c.servers ? `${c.servers} servers` : null,
            c.epgSources ? `${c.epgSources} EPG sources` : null,
          ]
            .filter(Boolean)
            .join(", ")
        : ""
    );

    const r = data.result as Record<string, { imported: number; skipped: number }> & { warnings?: string[] } | undefined;
    if (r) {
      const warnings = r.warnings ?? [];
      const visibleWarnings = showAllWarnings ? warnings : warnings.slice(0, 8);
      setResult(
        [
          `Bouquets: +${r.bouquets.imported} / skipped ${r.bouquets.skipped}`,
          `Streams: +${r.streams.imported} / skipped ${r.streams.skipped}`,
          `Lines: +${r.lines.imported} / skipped ${r.lines.skipped}`,
          `Resellers: +${r.resellers.imported} / skipped ${r.resellers.skipped}`,
          `MAG: +${r.magDevices.imported} / skipped ${r.magDevices.skipped}`,
          `Enigma: +${r.enigmaDevices.imported} / skipped ${r.enigmaDevices.skipped}`,
          `Categories: +${r.categories.imported} / skipped ${r.categories.skipped}`,
          `Servers: +${r.servers.imported} / skipped ${r.servers.skipped}`,
          `EPG: +${r.epgSources.imported} / skipped ${r.epgSources.skipped}`,
          visibleWarnings.length ? `Warnings: ${visibleWarnings.join("; ")}` : null,
          !showAllWarnings && warnings.length > 8 ? `... and ${warnings.length - 8} more warnings` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
    setProgress(null);
  }

  const hint = SOURCE_OPTIONS.find((s) => s.id === source)?.label ?? source;

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm opacity-80">
        Import from <strong>{hint}</strong>
        {isOneStream ? (
          <>
            {" "}
            — connect to the panel <strong>PostgreSQL</strong> database (read-only user recommended).
          </>
        ) : (
          <> using a MySQL <code>.sql</code> backup or Nexlify JSON.</>
        )}{" "}
        Streams-only:{" "}
        <Link href="/admin/import/m3u" style={{ color: "var(--accent)" }}>
          Import M3U
        </Link>
        .
      </p>

      <label className="block text-sm">
        Source panel
        <select
          className="mt-1 w-full rounded px-3 py-2"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div
        className="rounded-lg p-3 text-sm"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <p className="font-medium">Migration tips</p>
        <ul className="mt-1.5 space-y-1 opacity-80 list-disc pl-4">
          {isOneStream && (
            <li>
              <strong>1-stream:</strong> prefer <strong>PostgreSQL (live)</strong> — connect to the source panel
              database instead of uploading a dump when possible.
            </li>
          )}
          <li>
            Large <code>.sql</code> files upload directly to the server (up to 2 GB). Use paste or inline preview
            only for exports under {formatBytes(MAX_INLINE_BYTES)}.
          </li>
        </ul>
      </div>

      {isOneStream && (
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className="px-3 py-1.5 rounded"
            style={{
              background: inputMode === "postgres" ? "var(--accent)" : "var(--card)",
              color: inputMode === "postgres" ? "#fff" : "inherit",
              border: "1px solid var(--border)",
            }}
            onClick={() => setInputMode("postgres")}
          >
            PostgreSQL (live)
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded"
            style={{
              background: inputMode === "file" ? "var(--accent)" : "var(--card)",
              color: inputMode === "file" ? "#fff" : "inherit",
              border: "1px solid var(--border)",
            }}
            onClick={() => setInputMode("file")}
          >
            SQL / JSON file
          </button>
        </div>
      )}

      {usePostgres ? (
        <div className="space-y-3 text-sm">
          <p className="opacity-70">
            Credentials are sent only for this request and are not stored. Use a read-only DB role when
            possible.
          </p>
          <label className="block">
            Connection URL (optional — overrides fields below)
            <input
              className="mt-1 w-full rounded px-3 py-2 font-mono text-xs"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              placeholder="postgresql://user:pass@host:5432/dbname"
              value={pgUrl}
              onChange={(e) => setPgUrl(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              Host
              <input
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={pgHost}
                onChange={(e) => setPgHost(e.target.value)}
              />
            </label>
            <label className="block">
              Port
              <input
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={pgPort}
                onChange={(e) => setPgPort(e.target.value)}
              />
            </label>
            <label className="block">
              Database
              <input
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={pgDatabase}
                onChange={(e) => setPgDatabase(e.target.value)}
              />
            </label>
            <label className="block">
              User
              <input
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={pgUser}
                onChange={(e) => setPgUser(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              Password
              <input
                type="password"
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={pgPassword}
                onChange={(e) => setPgPassword(e.target.value)}
              />
            </label>
            <label className="block">
              Schema (optional)
              <input
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                placeholder="public"
                value={pgSchema}
                onChange={(e) => setPgSchema(e.target.value)}
              />
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" checked={pgSsl} onChange={(e) => setPgSsl(e.target.checked)} />
              SSL
            </label>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={testConnection}
          >
            Test connection &amp; detect tables
          </button>
          {probeInfo && (
            <pre
              className="text-xs whitespace-pre-wrap rounded p-3"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {probeInfo}
            </pre>
          )}
        </div>
      ) : (
        <>
          {source !== "nexlify_json" && (
            <label className="block text-sm">
              File format
              <select
                className="mt-1 w-full rounded px-3 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={format}
                onChange={(e) => setFormat(e.target.value as "sql" | "json")}
              >
                <option value="sql">SQL dump (.sql)</option>
                <option value="json">JSON bundle (.json)</option>
              </select>
            </label>
          )}

          <label className="block text-sm">
            Upload or paste export
            <input type="file" accept=".sql,.json,.txt" className="mt-1 block" onChange={onFile} />
            {uploadFile && uploadFile.size > MAX_INLINE_BYTES ? (
              <div
                className="mt-2 rounded px-3 py-2 text-xs"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <p>
                  <strong>{uploadFile.name}</strong> ({formatBytes(uploadFile.size)}) — uploaded on the server when
                  you run Preview or Import. Large dumps are not loaded into the browser to avoid crashes.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs underline"
                  style={{ color: "var(--accent)" }}
                  onClick={clearUpload}
                >
                  Remove file
                </button>
              </div>
            ) : (
              <textarea
                className="mt-2 w-full min-h-[160px] rounded px-3 py-2 font-mono text-xs"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (e.target.value.trim()) setUploadFile(null);
                }}
                placeholder="Paste SQL dump or JSON here (small exports only), or upload a .sql / .json file…"
              />
            )}
          </label>
        </>
      )}

      <label className="block text-sm">
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

      <div className="flex flex-wrap gap-4 text-sm">
        <label>
          <input type="checkbox" checked={importBouquets} onChange={(e) => setImportBouquets(e.target.checked)} />{" "}
          Bouquets / packages
        </label>
        <label>
          <input type="checkbox" checked={importStreams} onChange={(e) => setImportStreams(e.target.checked)} />{" "}
          Streams
        </label>
        <label>
          <input type="checkbox" checked={importLines} onChange={(e) => setImportLines(e.target.checked)} />{" "}
          Lines / subscriptions
        </label>
        <label>
          <input
            type="checkbox"
            checked={importResellers}
            onChange={(e) => setImportResellers(e.target.checked)}
          />{" "}
          Resellers
        </label>
        <label>
          <input type="checkbox" checked={importMag} onChange={(e) => setImportMag(e.target.checked)} />{" "}
          MAG devices
        </label>
        <label>
          <input
            type="checkbox"
            checked={importEnigma}
            onChange={(e) => setImportEnigma(e.target.checked)}
          />{" "}
          Enigma devices
        </label>
        <label>
          <input
            type="checkbox"
            checked={importCategories}
            onChange={(e) => setImportCategories(e.target.checked)}
          />{" "}
          Categories
        </label>
        <label>
          <input
            type="checkbox"
            checked={importServers}
            onChange={(e) => setImportServers(e.target.checked)}
          />{" "}
          Stream servers
        </label>
        <label>
          <input type="checkbox" checked={importEpg} onChange={(e) => setImportEpg(e.target.checked)} />{" "}
          EPG sources
        </label>
        <label>
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />{" "}
          Skip existing usernames / stream names
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          className="px-4 py-2 rounded text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          onClick={() => run(true)}
          disabled={!canRun()}
        >
          Preview
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={() => setShowBackupModal(true)}
          disabled={!canRun()}
        >
          Run import
        </button>
      </div>

      {uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-70">
            <span>Uploading file…</span>
            <span>{(uploadProgress.loaded / 1024 / 1024).toFixed(1)}MB / {(uploadProgress.total / 1024 / 1024).toFixed(1)}MB</span>
          </div>
          <div className="w-full rounded-full h-2" style={{ background: "var(--card)" }}>
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                background: "#f59e0b",
                width: `${uploadProgress.total > 0 ? (uploadProgress.loaded / uploadProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-70">
            <span>{progress.phase}</span>
            <span>{progress.current}/{progress.total} ({progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%)</span>
          </div>
          <div className="w-full rounded-full h-2" style={{ background: "var(--card)" }}>
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                background: "var(--accent)",
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {preview && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--accent)" }}>
          {preview}
        </p>
      )}
      {result && (
        <pre
          className="text-sm whitespace-pre-wrap rounded p-3"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {result}
        </pre>
      )}

      {showBackupModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowBackupModal(false)}
        >
          <div
            className="rounded-lg p-6 max-w-md w-full mx-4 space-y-4"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">Create backup first?</h3>
            <p className="text-sm opacity-80">
              We recommend creating a database backup before importing. You can do this from{" "}
              <a href="/admin/backup-restore" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                Admin → Backup &amp; Restore
              </a>.
            </p>
            <p className="text-xs opacity-60">
              If the import fails or produces unexpected results, you can restore from a backup.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded text-sm"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                onClick={() => setShowBackupModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded text-sm"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                onClick={() => {
                  window.open("/admin/backup-restore", "_blank");
                  setShowBackupModal(false);
                }}
              >
                Create backup first
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded text-sm"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => {
                  setShowBackupModal(false);
                  run(false);
                }}
              >
                Import without backup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
