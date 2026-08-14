"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MIGRATION_GUIDE_PATHS,
  guidePathFor,
  type MigrationGuidePath,
} from "@/lib/panel-migration/guide-paths";
import type { MigrationSource } from "@/lib/panel-migration/types";

const SOURCE_OPTIONS = MIGRATION_GUIDE_PATHS.map((p) => ({
  id: p.id,
  label: p.label,
}));

const GUIDE_DEFAULT_DBS = new Set(
  MIGRATION_GUIDE_PATHS.map((p) => p.defaultDatabase).filter(Boolean) as string[]
);
// Also treat common XUI DB aliases as “guide defaults” so switching sources can refresh the hint field.
GUIDE_DEFAULT_DBS.add("xuoione");
GUIDE_DEFAULT_DBS.add("xuione");
GUIDE_DEFAULT_DBS.add("xui");

type InputMode = "file" | "postgres";

/** SQL/JSON pasted or previewed in the textarea — keep small to avoid browser OOM. */
const MAX_INLINE_BYTES = 512 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Preview strip in import order: servers → content → lines → extras. */
function formatPreviewCounts(c: Record<string, number>): string {
  return [
    c.servers ? `${c.servers} servers` : null,
    c.categories ? `${c.categories} categories` : null,
    c.epgSources ? `${c.epgSources} EPG sources` : null,
    c.providers ? `${c.providers} providers` : null,
    c.providerLinks ? `${c.providerLinks} provider links` : null,
    `${c.streams ?? 0} streams`,
    c.live != null ? `${c.live} live` : null,
    c.movies != null ? `${c.movies} movies` : null,
    c.series != null ? `${c.series} TV series` : null,
    c.episodes != null ? `${c.episodes} TV episodes` : null,
    `${c.bouquets ?? 0} bouquets`,
    c.packages ? `${c.packages} packages` : null,
    c.watchFolders ? `${c.watchFolders} watch folders` : null,
    c.watchLogs ? `${c.watchLogs} watch logs` : null,
    c.watchCategories ? `${c.watchCategories} watch categories` : null,
    c.watchRefresh ? `${c.watchRefresh} watch refresh` : null,
    `${c.lines ?? 0} lines`,
    `${c.resellers ?? 0} resellers`,
    `${c.magDevices ?? 0} MAG`,
    `${c.enigmaDevices ?? 0} Enigma`,
    c.tickets ? `${c.tickets} tickets` : null,
    c.epgChannels ? `${c.epgChannels} EPG channels` : null,
    c.epgPrograms ? `${c.epgPrograms} EPG programmes` : null,
    c.epgApi ? `${c.epgApi} epg_api channels` : null,
    c.epgLanguages ? `${c.epgLanguages} epg languages` : null,
    c.blockedAsns ? `${c.blockedAsns} ASN blocks` : null,
    c.blockedUserAgents ? `${c.blockedUserAgents} blocked UAs` : null,
    c.accessCodes ? `${c.accessCodes} access codes` : null,
    c.userGroups ? `${c.userGroups} user groups` : null,
    c.liveConnections ? `${c.liveConnections} live sessions` : null,
    c.onDemandStreams ? `${c.onDemandStreams} on-demand streams` : null,
    c.crontab ? `${c.crontab} crontab rows` : null,
    c.profiles ? `${c.profiles} profiles` : null,
    c.creditLogs ? `${c.creditLogs} credit logs` : null,
    c.streamOptions ? `${c.streamOptions} stream options` : null,
    c.streamArguments ? `${c.streamArguments} stream args` : null,
    c.streamErrors ? `${c.streamErrors} stream errors` : null,
    c.extraBlobs ? `${c.extraBlobs} extra table blobs` : null,
    c.activityLogs ? `${c.activityLogs} log rows` : null,
    c.bandwidthSnapshots ? `${c.bandwidthSnapshots} stats snapshots` : null,
    c.settings ? `settings blob` : null,
  ]
    .filter(Boolean)
    .join(", ");
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
  const [importPackages, setImportPackages] = useState(true);
  const [importProviders, setImportProviders] = useState(true);
  const [importWatchFolders, setImportWatchFolders] = useState(true);
  const [importTickets, setImportTickets] = useState(true);
  /** Full EPG guide on by default (large dumps can take longer). */
  const [importEpgGuide, setImportEpgGuide] = useState(true);
  const [importBlockedAsns, setImportBlockedAsns] = useState(true);
  const [importLogs, setImportLogs] = useState(true);
  const [importStats, setImportStats] = useState(true);
  const [importSettings, setImportSettings] = useState(true);
  /** Extra tables: access codes, blocked UAs, groups, on-demand, live sessions, epg_api, crontab, profiles, … */
  const [importExtras, setImportExtras] = useState(true);
  /** Match 1-stream Migration Guide — streams imported stopped by default. */
  const [importStreamsStopped, setImportStreamsStopped] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [clearData, setClearData] = useState(false);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number } | null>(null);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  /** Live status lines shown during upload / scan / import. */
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [importHealth, setImportHealth] = useState<{
    streams: number;
    live: number;
    movie: number;
    series: number;
    uncategorized: number;
    inactive: number;
    bouquets: number;
    categories: number;
    bouquetLinks: number;
    liveOrphans: number;
    noUrl?: number;
    lines?: number;
    linesWithoutBouquets?: number;
  } | null>(null);
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearInterval(redirectTimerRef.current);
    };
  }, []);

  const loadImportHealth = useCallback(() => {
    fetch("/api/admin/repair-import")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.streams === "number") setImportHealth(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadImportHealth();
  }, [loadImportHealth]);

  function appendLiveLog(line: string) {
    setLiveLog((prev) => {
      const next = [...prev, `${new Date().toLocaleTimeString()}  ${line}`];
      // Keep the panel readable on very long imports
      return next.length > 200 ? next.slice(-200) : next;
    });
  }

  function clearRedirectCountdown() {
    if (redirectTimerRef.current) {
      clearInterval(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    setRedirectSeconds(null);
  }

  function startDashboardRedirect(delaySec = 12) {
    clearRedirectCountdown();
    setRedirectSeconds(delaySec);
    redirectTimerRef.current = setInterval(() => {
      setRedirectSeconds((prev) => {
        if (prev == null) return null;
        if (prev <= 1) {
          if (redirectTimerRef.current) {
            clearInterval(redirectTimerRef.current);
            redirectTimerRef.current = null;
          }
          router.push("/admin");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const isOneStream = source === "onestream";
  const usePostgres = isOneStream && inputMode === "postgres";
  const path: MigrationGuidePath | undefined = useMemo(
    () => guidePathFor(source as MigrationSource),
    [source]
  );

  useEffect(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, []);

  useEffect(() => {
    if (source === "nexlify_json") setFormat("json");
    if (source === "onestream") setInputMode("postgres");
    else setInputMode("file");
    const db = guidePathFor(source as MigrationSource)?.defaultDatabase;
    if (db) {
      setPgDatabase((prev) => (!prev || GUIDE_DEFAULT_DBS.has(prev) ? db : prev));
    }
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
      importPackages,
      importProviders,
      importWatchFolders,
      importTickets,
      importEpgGuide,
      importBlockedAsns,
      importLogs,
      importStats,
      importSettings,
      importExtras,
      importStreamsStopped,
      skipExistingLines: skipExisting,
      skipExistingStreams: skipExisting,
      clearDataBeforeImport: clearData,
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
    clearRedirectCountdown();
    setResult(dryRun ? "Scanning…" : "Importing…");
    setPreview("");
    setProgress(null);
    setUploadProgress(null);
    setScanProgress(null);
    setScanning(dryRun);
    setImporting(!dryRun);
    setShowAllWarnings(false);
    setLiveLog([]);
    appendLiveLog(dryRun ? "Starting preview…" : "Starting import…");

    const handleSseEvent = (eventName: string, data: Record<string, unknown>) => {
      if (eventName === "start") {
        const msg = typeof data.message === "string" ? data.message : "Server started processing…";
        appendLiveLog(msg);
        setResult(msg);
        setUploadProgress(null);
        return;
      }
      if (eventName === "status") {
        const msg = typeof data.message === "string" ? data.message : "Working…";
        appendLiveLog(msg);
        setResult(msg);
        return;
      }
      if (eventName === "progress") {
        if (data.phase === "scanning") {
          setScanProgress({ current: Number(data.current) || 0, total: Number(data.total) || 100 });
          setProgress(null);
          setUploadProgress(null);
          setResult(`Scanning file… ${data.current}%`);
          if (Number(data.current) === 0 || Number(data.current) === 100 || Number(data.current) % 10 === 0) {
            appendLiveLog(`Scanning SQL dump… ${data.current}%`);
          }
        } else {
          const phase = String(data.phase ?? "import");
          const current = Number(data.current) || 0;
          const total = Number(data.total) || 0;
          setProgress({ phase, current, total });
          setScanProgress(null);
          setUploadProgress(null);
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setResult(`Importing ${phase}: ${current}/${total} (${pct}%)`);
          if (current === 1 || current === total || current % Math.max(1, Math.floor(total / 20) || 1) === 0) {
            appendLiveLog(`Importing ${phase}: ${current}/${total} (${pct}%)`);
          }
        }
        return;
      }
      if (eventName === "complete") {
        setUploadProgress(null);
        setScanning(false);
        setScanProgress(null);
        setImporting(false);
        setProgress(null);
        appendLiveLog("Import finished — building summary…");
        handleCompleteResponse(data);
        return;
      }
      if (eventName === "error") {
        setUploadProgress(null);
        setScanning(false);
        setScanProgress(null);
        setImporting(false);
        setProgress(null);
        const err = typeof data.error === "string" ? data.error : "Unknown error";
        appendLiveLog(`Error: ${err}`);
        setResult(`Error: ${err}`);
      }
    };

    /** Parse SSE chunks; returns leftover incomplete buffer via carry. */
    const consumeSse = (chunk: string, carry: { event: string | null; buf: string }) => {
      const text = carry.buf + chunk;
      const lines = text.split("\n");
      carry.buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          carry.event = line.slice(7).trim();
        } else if (line.startsWith("data: ") && carry.event) {
          try {
            handleSseEvent(carry.event, JSON.parse(line.slice(6)) as Record<string, unknown>);
          } catch {
            /* skip malformed */
          }
          carry.event = null;
        } else if (line === "") {
          carry.event = null;
        }
      }
    };

    try {
      if (usePostgres) {
        const payload: Record<string, unknown> = {
          ...migrationPayload(dryRun),
          format: "postgres",
          pg: pgConfig(),
        };
        const res = await fetch("/api/admin/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (dryRun) {
          const data = await res.json();
          setUploadProgress(null);
          setScanning(false);
          setScanProgress(null);
          setImporting(false);
          if (!res.ok) {
            setResult(`Error: ${data.error ?? res.statusText}`);
            return;
          }
          handlePreviewResponse(data);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setImporting(false);
          setResult(`Error: ${(data as { error?: string }).error ?? res.statusText}`);
          return;
        }
        if (!res.body) {
          setImporting(false);
          setResult("Error: No response body");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const carry = { event: null as string | null, buf: "" };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          consumeSse(decoder.decode(value, { stream: true }), carry);
        }
        if (carry.buf) consumeSse("\n", carry);
        return;
      }

      if (uploadFile && uploadFile.size > MAX_INLINE_BYTES) {
        const form = new FormData();
        form.append("file", uploadFile);
        form.append("payload", JSON.stringify(migrationPayload(dryRun)));
        appendLiveLog(`Uploading ${formatBytes(uploadFile.size)} dump to server…`);

        if (dryRun) {
          const res = await new Promise<Response>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/admin/migrate");
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                setUploadProgress({ loaded: e.loaded, total: e.total });
              }
            };
            xhr.onload = () => {
              resolve(
                new Response(xhr.responseText, {
                  status: xhr.status,
                  headers: {
                    "Content-Type":
                      xhr.getResponseHeader("Content-Type") || "application/json",
                  },
                })
              );
            };
            xhr.onerror = () => reject(new Error("Upload failed"));
            xhr.send(form);
          });
          const data = await res.json();
          setUploadProgress(null);
          setScanning(false);
          setScanProgress(null);
          setImporting(false);
          if (!res.ok) {
            setResult(`Error: ${data.error ?? res.statusText}`);
            return;
          }
          handlePreviewResponse(data);
          return;
        }

        // Import: parse SSE incrementally while XHR receives the stream.
        // Waiting for onload alone buffers the whole import with no live UI.
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/admin/migrate");
          xhr.responseType = "text";
          let sseOffset = 0;
          const carry = { event: null as string | null, buf: "" };
          let uploadDoneLogged = false;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress({ loaded: e.loaded, total: e.total });
              if (!uploadDoneLogged && e.loaded >= e.total) {
                uploadDoneLogged = true;
                appendLiveLog("Upload complete — waiting for server to start processing…");
                setResult("Upload complete — server is preparing the import…");
              }
            }
          };
          xhr.upload.onload = () => {
            if (!uploadDoneLogged) {
              uploadDoneLogged = true;
              appendLiveLog("Upload complete — waiting for server to start processing…");
              setResult("Upload complete — server is preparing the import…");
            }
            setUploadProgress(null);
          };

          const pumpSse = () => {
            const text = xhr.responseText || "";
            if (text.length <= sseOffset) return;
            const chunk = text.slice(sseOffset);
            sseOffset = text.length;
            consumeSse(chunk, carry);
          };

          xhr.onprogress = () => pumpSse();
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 3 || xhr.readyState === 4) pumpSse();
          };
          xhr.onload = () => {
            pumpSse();
            if (carry.buf) consumeSse("\n", carry);
            if (xhr.status >= 400) {
              try {
                const data = JSON.parse(xhr.responseText);
                setResult(`Error: ${data.error ?? xhr.statusText}`);
                appendLiveLog(`Error: ${data.error ?? xhr.statusText}`);
              } catch {
                setResult(`Error: ${xhr.statusText || "Import failed"}`);
              }
              setImporting(false);
            }
            resolve();
          };
          xhr.onerror = () => reject(new Error("Upload / import connection failed"));
          xhr.send(form);
        });
        setUploadProgress(null);
        setScanning(false);
        setScanProgress(null);
        setImporting(false);
        return;
      }

      const payload: Record<string, unknown> = {
        ...migrationPayload(dryRun),
        format,
        content,
      };
      const res = await fetch("/api/admin/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (dryRun) {
        const data = await res.json();
        setUploadProgress(null);
        setScanning(false);
        setScanProgress(null);
        setImporting(false);
        if (!res.ok) {
          setResult(`Error: ${data.error ?? res.statusText}`);
          return;
        }
        handlePreviewResponse(data);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setImporting(false);
        setResult(`Error: ${(data as { error?: string }).error ?? res.statusText}`);
        return;
      }
      if (!res.body) {
        setImporting(false);
        setResult("Error: No response body");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const carry = { event: null as string | null, buf: "" };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeSse(decoder.decode(value, { stream: true }), carry);
      }
      if (carry.buf) consumeSse("\n", carry);
    } catch (e) {
      setImporting(false);
      setScanning(false);
      setUploadProgress(null);
      setScanProgress(null);
      setProgress(null);
      const msg = e instanceof Error ? e.message : String(e);
      appendLiveLog(`Error: ${msg}`);
      setResult(`Error: ${msg}`);
    } finally {
      setUploadProgress(null);
      setScanning(false);
      setScanProgress(null);
      setImporting(false);
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
    const tablesFound = (preview?.tablesFound as { name: string; rows: number; hasColumns: boolean }[]) ?? [];

    setPreview(c ? formatPreviewCounts(c) : "");

    const tablesLine = tablesFound.length
      ? `Tables detected in dump: ${tablesFound
          .map((t) => `${t.name} (${t.rows} rows${t.hasColumns ? "" : ", no column names"})`)
          .join(", ")}`
      : null;

    if (parseWarnings.length) {
      setResult(
        [
          "Preview complete.",
          tablesLine,
          "",
          "Parse warnings:",
          ...parseWarnings.map((w) => `  - ${w}`),
        ]
          .filter(Boolean)
          .join("\n")
      );
    } else {
      setResult(
        ["Preview complete — review counts, then run import.", tablesLine].filter(Boolean).join("\n")
      );
    }
    appendLiveLog("Preview complete.");
  }

  function handleCompleteResponse(data: Record<string, unknown>) {
    const probe = data.probe as Record<string, unknown> | undefined;
    if (probe?.mapping) {
      const mapped = Object.keys(probe.mapping as Record<string, unknown>).join(", ");
      setProbeInfo((prev) => (prev ? prev : `Mapped: ${mapped}`));
    }

    const c = (data.preview as Record<string, unknown>)?.counts as Record<string, number> | undefined;
    setPreview(c ? formatPreviewCounts(c) : "");

    const r = data.result as (Record<string, { imported: number; skipped: number }> & {
      warnings?: string[];
    }) | undefined;
    if (r) {
      const warnings = r.warnings ?? [];
      const visibleWarnings = showAllWarnings ? warnings : warnings.slice(0, 8);
      const totalImported =
        r.bouquets.imported +
        r.streams.imported +
        r.lines.imported +
        r.resellers.imported +
        r.magDevices.imported +
        r.enigmaDevices.imported +
        r.categories.imported +
        r.servers.imported +
        r.epgSources.imported +
        (r.packages?.imported ?? 0) +
        (r.providers?.imported ?? 0) +
        (r.watchFolders?.imported ?? 0) +
        (r.tickets?.imported ?? 0) +
        (r.epgPrograms?.imported ?? 0) +
        (r.blockedAsns?.imported ?? 0) +
        (r.activityLogs?.imported ?? 0) +
        (r.bandwidthSnapshots?.imported ?? 0) +
        (r.settings?.imported ?? 0) +
        (r.accessCodes?.imported ?? 0) +
        (r.blockedUserAgents?.imported ?? 0) +
        (r.userGroups?.imported ?? 0) +
        (r.liveConnections?.imported ?? 0) +
        (r.onDemandStreams?.imported ?? 0) +
        (r.extrasBlobs?.imported ?? 0);
      const tablesFound = (data.preview as Record<string, unknown> | undefined)?.tablesFound as
        | { name: string; rows: number; hasColumns: boolean }[]
        | undefined;
      const tablesLine = tablesFound?.length
        ? `Tables detected in dump: ${tablesFound
            .map((t) => `${t.name} (${t.rows} rows${t.hasColumns ? "" : ", no column names"})`)
            .join(", ")}`
        : null;
      setResult(
        [
          totalImported > 0
            ? `Import complete! ${totalImported} item(s) loaded into the database.`
            : "Import complete! No new items were imported (all existing items were skipped).",
          tablesLine,
          "",
          `Bouquets: +${r.bouquets.imported} / skipped ${r.bouquets.skipped}`,
          `Streams: +${r.streams.imported} / skipped ${r.streams.skipped}`,
          `Lines: +${r.lines.imported} / skipped ${r.lines.skipped}`,
          `Resellers: +${r.resellers.imported} / skipped ${r.resellers.skipped}`,
          `MAG: +${r.magDevices.imported} / skipped ${r.magDevices.skipped}`,
          `Enigma: +${r.enigmaDevices.imported} / skipped ${r.enigmaDevices.skipped}`,
          `Categories: +${r.categories.imported} / skipped ${r.categories.skipped}`,
          `Servers: +${r.servers.imported} / skipped ${r.servers.skipped}`,
          `EPG sources: +${r.epgSources.imported} / skipped ${r.epgSources.skipped}`,
          r.packages ? `Packages: +${r.packages.imported} / skipped ${r.packages.skipped}` : null,
          r.providers ? `Providers: +${r.providers.imported} / skipped ${r.providers.skipped}` : null,
          r.watchFolders
            ? `Watch folders: +${r.watchFolders.imported} / skipped ${r.watchFolders.skipped}`
            : null,
          r.tickets ? `Tickets: +${r.tickets.imported} / skipped ${r.tickets.skipped}` : null,
          r.epgPrograms
            ? `EPG programmes: +${r.epgPrograms.imported} / skipped ${r.epgPrograms.skipped}`
            : null,
          r.blockedAsns ? `ASN blocks: +${r.blockedAsns.imported} / skipped ${r.blockedAsns.skipped}` : null,
          r.activityLogs ? `Logs: +${r.activityLogs.imported} / skipped ${r.activityLogs.skipped}` : null,
          r.bandwidthSnapshots
            ? `Stats: +${r.bandwidthSnapshots.imported} / skipped ${r.bandwidthSnapshots.skipped}`
            : null,
          r.settings ? `Settings: +${r.settings.imported} / skipped ${r.settings.skipped}` : null,
          r.accessCodes
            ? `Access codes: +${r.accessCodes.imported} / skipped ${r.accessCodes.skipped}`
            : null,
          r.blockedUserAgents
            ? `Blocked UAs: +${r.blockedUserAgents.imported} / skipped ${r.blockedUserAgents.skipped}`
            : null,
          r.userGroups
            ? `User groups: +${r.userGroups.imported} / skipped ${r.userGroups.skipped}`
            : null,
          r.liveConnections
            ? `Live sessions: +${r.liveConnections.imported} / skipped ${r.liveConnections.skipped}`
            : null,
          r.onDemandStreams
            ? `On-demand flags: +${r.onDemandStreams.imported} / skipped ${r.onDemandStreams.skipped}`
            : null,
          r.extrasBlobs
            ? `Extra blobs (epg_api/crontab/profiles/…): +${r.extrasBlobs.imported} / skipped ${r.extrasBlobs.skipped}`
            : null,
          visibleWarnings.length ? `Warnings: ${visibleWarnings.join("; ")}` : null,
          !showAllWarnings && warnings.length > 8 ? `... and ${warnings.length - 8} more warnings` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
      appendLiveLog(
        totalImported > 0
          ? `Import complete — ${totalImported} item(s) imported.`
          : "Import complete — nothing new imported (skipped existing)."
      );
      startDashboardRedirect(12);
    } else {
      setResult("Import finished, but no result data was returned. The database may have been updated.");
      appendLiveLog("Import finished (no detailed result payload).");
      startDashboardRedirect(12);
    }
    setProgress(null);
  }

  const hint = path?.label ?? SOURCE_OPTIONS.find((s) => s.id === source)?.label ?? source;

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm opacity-80">
        Import from <strong>{hint}</strong>
        {path?.defaultDatabase ? (
          <>
            {" "}
            — default database name <code>{path.defaultDatabase}</code>
          </>
        ) : null}
        {isOneStream ? (
          <>
            {" "}
            — connect to the panel <strong>PostgreSQL</strong> database (read-only user recommended).
          </>
        ) : path?.engine === "json" ? (
          <> using a Nexlify JSON bundle.</>
        ) : (
          <> using a MySQL <code>.sql</code> backup.</>
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
          {SOURCE_OPTIONS.map((s) => {
            const db = guidePathFor(s.id)?.defaultDatabase;
            return (
              <option key={s.id} value={s.id}>
                {s.label}
                {db ? ` (${db})` : ""}
              </option>
            );
          })}
        </select>
        {path?.hint ? <p className="mt-1 text-xs opacity-70">{path.hint}</p> : null}
      </label>

      {path && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="font-medium">Correct migration path</p>
          <p className="mt-1 text-xs opacity-70">
            Mapped from the official 1-stream Migration Guide (Experimental) for use on Nexlify — use this
            UI, not <code>php artisan migrate-system</code>.
          </p>
          <ol className="mt-2 space-y-1 opacity-90 list-decimal pl-4">
            {path.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {path.notes.length > 0 && (
            <ul className="mt-2 space-y-1 opacity-70 list-disc pl-4 text-xs">
              {path.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs opacity-70">
            Large <code>.sql</code> files upload directly to the server (up to 2 GB). Paste/inline preview only
            for exports under {formatBytes(MAX_INLINE_BYTES)}.
          </p>
        </div>
      )}

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
                placeholder={path?.defaultDatabase ?? "dbname"}
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
          <input
            type="checkbox"
            checked={importServers}
            onChange={(e) => setImportServers(e.target.checked)}
          />{" "}
          Stream servers
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
          <input type="checkbox" checked={importEpg} onChange={(e) => setImportEpg(e.target.checked)} />{" "}
          EPG sources (URLs)
        </label>
        <label>
          <input
            type="checkbox"
            checked={importProviders}
            onChange={(e) => setImportProviders(e.target.checked)}
          />{" "}
          Providers / provider streams
        </label>
        <label>
          <input type="checkbox" checked={importStreams} onChange={(e) => setImportStreams(e.target.checked)} />{" "}
          Streams
        </label>
        <label>
          <input
            type="checkbox"
            checked={importStreamsStopped}
            onChange={(e) => setImportStreamsStopped(e.target.checked)}
            disabled={!importStreams}
          />{" "}
          Import streams as stopped
        </label>
        <label>
          <input type="checkbox" checked={importBouquets} onChange={(e) => setImportBouquets(e.target.checked)} />{" "}
          Channel bouquets
        </label>
        <label>
          <input type="checkbox" checked={importPackages} onChange={(e) => setImportPackages(e.target.checked)} />{" "}
          Billing packages
        </label>
        <label>
          <input
            type="checkbox"
            checked={importWatchFolders}
            onChange={(e) => setImportWatchFolders(e.target.checked)}
          />{" "}
          Watch folders / watch logs
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
            checked={importTickets}
            onChange={(e) => setImportTickets(e.target.checked)}
          />{" "}
          Tickets
        </label>
        <label>
          <input
            type="checkbox"
            checked={importEpgGuide}
            onChange={(e) => setImportEpgGuide(e.target.checked)}
          />{" "}
          Full EPG guide (epg_data / epg_channels)
        </label>
        <label>
          <input
            type="checkbox"
            checked={importBlockedAsns}
            onChange={(e) => setImportBlockedAsns(e.target.checked)}
          />{" "}
          ASN blocks
        </label>
        <label>
          <input type="checkbox" checked={importLogs} onChange={(e) => setImportLogs(e.target.checked)} />{" "}
          Logs (capped)
        </label>
        <label>
          <input type="checkbox" checked={importStats} onChange={(e) => setImportStats(e.target.checked)} />{" "}
          Stats snapshots (capped)
        </label>
        <label>
          <input
            type="checkbox"
            checked={importSettings}
            onChange={(e) => setImportSettings(e.target.checked)}
          />{" "}
          Settings (review blob)
        </label>
        <label>
          <input
            type="checkbox"
            checked={importExtras}
            onChange={(e) => setImportExtras(e.target.checked)}
          />{" "}
          Extra tables (access codes, UAs, groups, on-demand, live sessions, epg_api, crontab, profiles, …)
        </label>
        <label>
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />{" "}
          Skip existing usernames / stream names
        </label>
        <label>
          <input type="checkbox" checked={clearData} onChange={(e) => setClearData(e.target.checked)} />{" "}
          <span style={{ color: "#ef4444" }}>Clear all data before import</span>
        </label>
      </div>

      {path && path.postImport.length > 0 && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="font-medium">After import (guide checklist)</p>
          <ul className="mt-1.5 space-y-1 opacity-80 list-disc pl-4 text-xs">
            {path.postImport.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {importHealth && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="font-medium">What is on this panel now</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            {importHealth.streams.toLocaleString()} streams ({importHealth.live.toLocaleString()} live,{" "}
            {importHealth.movie.toLocaleString()} movies, {importHealth.series.toLocaleString()} series) ·{" "}
            {importHealth.categories.toLocaleString()} categories · {importHealth.bouquets.toLocaleString()} bouquets ·{" "}
            {importHealth.bouquetLinks.toLocaleString()} bouquet links
            {importHealth.liveOrphans ? ` · ${importHealth.liveOrphans.toLocaleString()} live streams not in any bouquet` : ""}
            {importHealth.noUrl ? ` · ${importHealth.noUrl.toLocaleString()} streams with empty URL` : ""}
            {importHealth.linesWithoutBouquets
              ? ` · ${importHealth.linesWithoutBouquets.toLocaleString()} lines with no bouquets`
              : ""}
            {importHealth.uncategorized ? ` · ${importHealth.uncategorized.toLocaleString()} uncategorized` : ""}
            {importHealth.inactive ? ` · ${importHealth.inactive.toLocaleString()} inactive` : ""}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          className="px-4 py-2 rounded text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)", opacity: importing || scanning ? 0.5 : 1 }}
          onClick={() => run(true)}
          disabled={!canRun() || importing || scanning}
        >
          Preview
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded text-sm"
          style={{ background: "var(--accent)", color: "#fff", opacity: importing || scanning ? 0.5 : 1 }}
          onClick={() => setShowBackupModal(true)}
          disabled={!canRun() || importing || scanning}
        >
          {importing ? "Importing…" : "Run import"}
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)", opacity: repairing ? 0.5 : 1 }}
          disabled={repairing || importing}
          onClick={async () => {
            setRepairing(true);
            setResult("Repairing imported streams, categories, and bouquets…");
            try {
              const res = await fetch("/api/admin/repair-import", { method: "POST" });
              const d = await res.json();
              if (!res.ok) {
                setResult(d.error ?? "Repair failed");
              } else {
                const r = d.result ?? {};
                setResult(
                  `Repair done. Activated ${r.streamsActivated ?? 0} streams; linked ${r.liveLinkedToBouquets ?? 0} live, ${r.moviesLinkedToBouquets ?? 0} movies, ${r.seriesLinkedToBouquets ?? 0} series into bouquets; attached ${r.linesLinkedToBouquets ?? 0} line-bouquet links; categorized ${r.liveCategorized ?? 0} live / ${r.movieCategorized ?? 0} movies / ${r.seriesCategorized ?? 0} series.`
                );
                loadImportHealth();
              }
            } catch (e) {
              setResult(e instanceof Error ? e.message : "Repair failed");
            } finally {
              setRepairing(false);
            }
          }}
        >
          {repairing ? "Repairing…" : "Repair existing import"}
        </button>
      </div>

      {uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-70">
            <span>Uploading file…</span>
            <span>{(uploadProgress.loaded / 1024 / 1024).toFixed(1)}MB / {(uploadProgress.total / 1024 / 1024).toFixed(1)}MB</span>
          </div>
          <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: "var(--card)" }}>
            <div
              className="h-2.5 rounded-full transition-all duration-300"
              style={{
                background: "linear-gradient(90deg, #f59e0b, #f97316)",
                width: `${uploadProgress.total > 0 ? (uploadProgress.loaded / uploadProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {scanProgress && !uploadProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-70">
            <span>Scanning & parsing SQL…</span>
            <span>{scanProgress.current}%</span>
          </div>
          <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: "var(--card)" }}>
            <div
              className="h-2.5 rounded-full transition-all duration-300"
              style={{
                background: "linear-gradient(90deg, #06b6d4, #3b82f6)",
                width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {(scanning || importing) && !uploadProgress && !scanProgress && !progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-70">
            <span>{importing ? "Import in progress…" : "Scanning file…"}</span>
            <span className="animate-pulse">working</span>
          </div>
          <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: "var(--card)" }}>
            <div
              className="h-2.5 rounded-full"
              style={{
                background: "linear-gradient(90deg, #06b6d4, #3b82f6)",
                width: "40%",
                animation: "scan-progress 1.5s ease-in-out infinite",
              }}
            />
          </div>
          <style>{`
            @keyframes scan-progress {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(350%); }
            }
          `}</style>
        </div>
      )}

      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-70">
            <span>Importing {progress.phase}…</span>
            <span>{progress.current}/{progress.total} ({progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%)</span>
          </div>
          <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: "var(--card)" }}>
            <div
              className="h-2.5 rounded-full transition-all duration-300"
              style={{
                background: "linear-gradient(90deg, #22c55e, #10b981)",
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {liveLog.length > 0 && (
        <div
          className="rounded p-3 max-h-48 overflow-y-auto text-xs font-mono space-y-0.5"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="flex justify-between items-center mb-1 opacity-70 text-[11px] font-sans">
            <span>Live import log</span>
            {(importing || scanning || uploadProgress) && (
              <span className="animate-pulse" style={{ color: "var(--accent)" }}>
                running…
              </span>
            )}
          </div>
          {liveLog.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className="opacity-90 whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </div>
      )}

      {redirectSeconds != null && redirectSeconds > 0 && (
        <div
          className="rounded p-3 text-sm flex flex-wrap items-center justify-between gap-3"
          style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)" }}
        >
          <span>
            Import complete. Opening the dashboard in <strong>{redirectSeconds}s</strong> so you can review
            the results above…
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              onClick={() => clearRedirectCountdown()}
            >
              Stay here
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => {
                clearRedirectCountdown();
                router.push("/admin");
              }}
            >
              Go to dashboard now
            </button>
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
            className="rounded-lg p-6 max-w-xl w-full mx-4 space-y-4 shadow-2xl"
            style={{ background: "#0f172a", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">Create backup first?</h3>
            {clearData && (
              <p className="text-sm font-medium" style={{ color: "#ef4444" }}>
                Warning: "Clear all data before import" is checked. All existing lines, streams, bouquets, users, categories, and servers will be permanently deleted before the import runs.
              </p>
            )}
            <p className="text-sm" style={{ color: "#e2e8f0" }}>
              We recommend creating a database backup before importing. You can do this from{" "}
              <a href="/admin/backup-restore" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                Admin → Backup &amp; Restore
              </a>.
            </p>
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              If the import fails or produces unexpected results, you can restore from a backup.
            </p>
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded text-sm whitespace-nowrap"
                style={{ background: "#1e293b", border: "1px solid var(--border)", color: "#e2e8f0" }}
                onClick={() => setShowBackupModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded text-sm whitespace-nowrap"
                style={{ background: "#1e293b", border: "1px solid var(--border)", color: "#e2e8f0" }}
                onClick={() => {
                  window.open("/admin/backup-restore", "_blank");
                  setShowBackupModal(false);
                }}
              >
                Create backup first
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded text-sm whitespace-nowrap"
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
