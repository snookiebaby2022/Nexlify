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

export function PanelMigrateForm() {
  const [source, setSource] = useState<string>("onestream");
  const [inputMode, setInputMode] = useState<InputMode>("postgres");
  const [format, setFormat] = useState<"sql" | "json">("sql");
  const [content, setContent] = useState("");
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
  const [importResellers, setImportResellers] = useState(false);
  const [importMag, setImportMag] = useState(false);
  const [importCategories, setImportCategories] = useState(true);
  const [importServers, setImportServers] = useState(true);
  const [importEpg, setImportEpg] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");

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
    return Boolean(content.trim());
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
    if (file.name.endsWith(".json")) setFormat("json");
    else if (file.name.endsWith(".sql")) setFormat("sql");
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
    const payload: Record<string, unknown> = {
      source,
      dryRun,
      importBouquets,
      importStreams,
      importLines,
      importResellers,
      importMag,
      importCategories: usePostgres ? importCategories : undefined,
      importServers: usePostgres ? importServers : undefined,
      importEpg: usePostgres ? importEpg : undefined,
      skipExistingLines: skipExisting,
      skipExistingStreams: skipExisting,
      defaultServerId: serverId || null,
    };

    if (usePostgres) {
      payload.format = "postgres";
      payload.pg = pgConfig();
    } else {
      payload.format = format;
      payload.content = content;
    }

    const res = await fetch("/api/admin/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult(`Error: ${data.error ?? res.statusText}`);
      return;
    }

    if (data.probe?.mapping) {
      const mapped = Object.keys(data.probe.mapping).join(", ");
      setProbeInfo((prev) => (prev ? prev : `Mapped: ${mapped}`));
    }

    const c = data.preview?.counts;
    setPreview(
      c
        ? `Found: ${c.bouquets} bouquets, ${c.streams} streams, ${c.lines} lines, ${c.resellers} resellers, ${c.magDevices} MAG`
        : ""
    );
    if (dryRun) {
      setResult("Preview complete — review counts, then run import.");
      return;
    }
    const r = data.result;
    if (r) {
      setResult(
        [
          `Bouquets: +${r.bouquets.imported} / skipped ${r.bouquets.skipped}`,
          `Streams: +${r.streams.imported} / skipped ${r.streams.skipped}`,
          `Lines: +${r.lines.imported} / skipped ${r.lines.skipped}`,
          r.resellers
            ? `Resellers: +${r.resellers.imported} / skipped ${r.resellers.skipped}`
            : null,
          r.magDevices
            ? `MAG: +${r.magDevices.imported} / skipped ${r.magDevices.skipped}`
            : null,
          r.warnings?.length ? `Warnings: ${r.warnings.slice(0, 5).join("; ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
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
            <textarea
              className="mt-2 w-full min-h-[160px] rounded px-3 py-2 font-mono text-xs"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste SQL dump or JSON here…"
            />
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
        {usePostgres && (
          <>
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
          </>
        )}
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
          onClick={() => run(false)}
          disabled={!canRun()}
        >
          Run import
        </button>
      </div>

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
    </div>
  );
}
