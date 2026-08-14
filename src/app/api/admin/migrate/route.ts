import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  MIGRATION_SOURCES,
  previewMigrationBundle,
  runMigration,
  runMigrationFromPostgres,
  type MigrationSource,
  type PostgresMigrationConfig,
} from "@/lib/panel-migration";
import { bundleFromSqlFile } from "@/lib/panel-migration/map-rows";
import Busboy from "busboy";
import { Readable } from "stream";
import { unlink, stat } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";

const SOURCES = new Set(MIGRATION_SOURCES.map((s) => s.id));

/** Large SQL dumps are uploaded as multipart/form-data to avoid loading them in the browser. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function applyOptions(body: Record<string, unknown>) {
  return {
    dryRun: Boolean(body.dryRun),
    importBouquets: body.importBouquets !== false,
    importStreams: body.importStreams !== false,
    importLines: body.importLines !== false,
    importResellers: body.importResellers !== false,
    importMag: body.importMag !== false,
    importEnigma: body.importEnigma !== false,
    importCategories: body.importCategories !== false,
    importServers: body.importServers !== false,
    importEpg: body.importEpg !== false,
    importPackages: body.importPackages !== false,
    importProviders: body.importProviders !== false,
    importWatchFolders: body.importWatchFolders !== false,
    importTickets: body.importTickets !== false,
    /** Full EPG guide on by default; uncheck for source URLs only. */
    importEpgGuide: body.importEpgGuide !== false,
    importBlockedAsns: body.importBlockedAsns !== false,
    importLogs: body.importLogs !== false,
    importStats: body.importStats !== false,
    importSettings: body.importSettings !== false,
    importExtras: body.importExtras !== false,
    skipExistingLines: body.skipExistingLines !== false,
    skipExistingStreams: body.skipExistingStreams !== false,
    clearDataBeforeImport: Boolean(body.clearDataBeforeImport),
    /** Opt-in: import streams stopped for URL verification before go-live. */
    importStreamsStopped: body.importStreamsStopped === true,
    /** Default on: all streams (live/movies/series) import as on-demand. */
    importStreamsOnDemand: body.importStreamsOnDemand !== false,
    defaultServerId: (body.defaultServerId as string) ?? null,
    ownerId: (body.ownerId as string) ?? null,
  };
}

function parseBodyRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Read file in chunks for processing. Reports bytes read for progress tracking. */
async function readFileInChunks(
  filePath: string,
  callback: (line: string, bytesRead: number) => void,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<void> {
  const fileStats = await stat(filePath);
  const totalBytes = fileStats.size;

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 }); // 1MB chunks
    let buffer = "";
    let bytesRead = 0;
    let lastProgressBytes = 0;

    stream.on("data", (chunk: string) => {
      const chunkBytes = Buffer.byteLength(chunk, "utf8");
      bytesRead += chunkBytes;
      buffer += chunk;
      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer
      for (const line of lines) {
        callback(line + "\n", bytesRead);
      }
      // Report progress every 10MB
      if (onProgress && bytesRead - lastProgressBytes > 10 * 1024 * 1024) {
        lastProgressBytes = bytesRead;
        onProgress(bytesRead, totalBytes);
      }
    });

    stream.on("end", () => {
      if (buffer) callback(buffer, bytesRead);
      if (onProgress) onProgress(bytesRead, totalBytes);
      resolve();
    });

    stream.on("error", reject);
  });
}



async function parseRequestBody(req: NextRequest): Promise<
  | { ok: true; body: Record<string, unknown>; content?: string; filePath?: string }
  | { ok: false; error: string; status: number }
> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return parseMultipart(req);
  }

  const body = parseBodyRecord(await req.json());
  if (!body) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  return { ok: true, body };
}

/**
 * Stream multipart uploads directly from the raw request body.
 * Next.js caps `req.formData()`/`req.json()` at ~10MB, so we bypass those
 * high-level parsers and pipe `req.body` into busboy (no size limit).
 */
async function parseMultipart(req: NextRequest): Promise<
  | { ok: true; body: Record<string, unknown>; content?: string; filePath?: string }
  | { ok: false; error: string; status: number }
> {
  const contentType = req.headers.get("content-type") ?? "";
  const busboy = Busboy({
    headers: { "content-type": contentType },
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  let payloadRaw: string | null = null;
  let tempPath: string | null = null;
  let fileSize = 0;
  let fileError: string | null = null;
  let fileWriteDone: Promise<void> | null = null;

  const parsed = new Promise<void>((resolve, reject) => {
    busboy.on("field", (name, val) => {
      if (name === "payload") payloadRaw = val;
    });
    busboy.on("file", (name, file, _info) => {
      if (name !== "file") {
        file.resume();
        return;
      }
      tempPath = `/tmp/nexlify-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`;
      const ws = createWriteStream(tempPath);
      fileWriteDone = new Promise<void>((res, rej) => {
        ws.on("finish", res);
        ws.on("error", rej);
      });
      file.on("data", (d: Buffer) => {
        fileSize += d.length;
      });
      file.on("limit", () => {
        fileError = `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`;
      });
      file.pipe(ws);
    });
    busboy.on("close", () => resolve());
    busboy.on("error", reject);
  });

  try {
    const nodeStream = Readable.fromWeb(
      req.body as unknown as ReadableStream<Uint8Array>,
    );
    nodeStream.pipe(busboy);
    await parsed;
    if (fileWriteDone) await fileWriteDone;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to parse upload",
      status: 400,
    };
  }

  if (fileError) return { ok: false, error: fileError, status: 413 };
  if (!tempPath || fileSize === 0) {
    return { ok: false, error: "file required", status: 400 };
  }

  let body: Record<string, unknown> | null = null;
  if (typeof payloadRaw === "string") {
    try {
      body = parseBodyRecord(JSON.parse(payloadRaw));
    } catch {
      return { ok: false, error: "Invalid payload JSON", status: 400 };
    }
  }
  if (!body) {
    return { ok: false, error: "payload required", status: 400 };
  }

  return { ok: true, body, filePath: tempPath };
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ sources: MIGRATION_SOURCES });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseRequestBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { body, content: uploadedContent, filePath } = parsed;
  const source = body.source as MigrationSource;
  if (!SOURCES.has(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const format = body.format as string | undefined;
  const opts = applyOptions(body);

  // Clean up temp file after processing
  const cleanup = async () => {
    if (filePath) {
      try { await unlink(filePath); } catch { /* ignore */ }
    }
  };

  try {
    // For dry runs, return JSON directly (fast)
    if (opts.dryRun) {
      if (format === "postgres") {
        const pg = body.pg as PostgresMigrationConfig | undefined;
        if (!pg?.connectionString && !(pg?.host && pg?.database && pg?.user)) {
          return NextResponse.json(
            { error: "pg.connectionString or pg.host/database/user required" },
            { status: 400 }
          );
        }
        const out = await runMigrationFromPostgres(pg, source, opts);
        await cleanup();
        return NextResponse.json({
          preview: out.preview,
          probe: out.probe,
        });
      }

      let content: string | undefined;
      
      if (filePath) {
        // For large files, stream-parse directly to bundle
        const bundle = await bundleFromSqlFile(filePath, source);
        await cleanup();
        return NextResponse.json({ preview: previewMigrationBundle(bundle) });
      } else {
        content = (uploadedContent ?? (body.content as string | undefined) ?? "").trim();
      }
      
      if (!content) {
        await cleanup();
        return NextResponse.json({ error: "content required" }, { status: 400 });
      }
      
      const fileFormat = format === "json" || source === "nexlify_json" ? "json" : "sql";
      const out = await runMigration(content, source, fileFormat, opts);
      await cleanup();
      return NextResponse.json({ preview: out.preview });
    }

    // For actual imports, stream progress via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        // Send immediate event to prevent client timeout on long parses
        send("start", {
          phase: "initializing",
          message: filePath
            ? "Upload received — preparing to scan SQL dump…"
            : "Starting import…",
        });

        try {
          // Throttle SSE progress so huge tables (EPG/streams) don't flood the client.
          let lastPhase = "";
          let lastSentAt = 0;
          let lastCurrent = -1;
          const onProgress = (phase: string, current: number, total: number) => {
            const now = Date.now();
            const phaseChanged = phase !== lastPhase;
            const isDone = total > 0 && current >= total;
            const everyN =
              total > 50_000 ? 500 : total > 5_000 ? 100 : total > 500 ? 25 : 1;
            const stepped = current === 1 || current % everyN === 0 || isDone;
            if (!phaseChanged && !stepped && now - lastSentAt < 400) return;
            if (!phaseChanged && current === lastCurrent && now - lastSentAt < 1000) return;
            lastPhase = phase;
            lastCurrent = current;
            lastSentAt = now;
            send("progress", { phase, current, total });
          };

          if (format === "postgres") {
            const pg = body.pg as PostgresMigrationConfig | undefined;
            if (!pg?.connectionString && !(pg?.host && pg?.database && pg?.user)) {
              send("error", { error: "pg.connectionString or pg.host/database/user required" });
              controller.close();
              return;
            }
            const out = await runMigrationFromPostgres(pg, source, { ...opts, onProgress });
            send("complete", { preview: out.preview, result: out.result, probe: out.probe });
          } else {
            let content: string | undefined;
            
            if (filePath) {
              let dumpLabel = "SQL dump";
              try {
                const st = await stat(filePath);
                dumpLabel = `${(st.size / (1024 * 1024)).toFixed(1)} MB SQL dump`;
              } catch {
                /* ignore */
              }
              send("status", { message: `Scanning & parsing ${dumpLabel}…` });
              send("progress", { phase: "scanning", current: 0, total: 100 });
              let lastScanPct = -1;
              const bundle = await bundleFromSqlFile(filePath, source, (bytesRead, totalBytes) => {
                const pct = Math.round((bytesRead / totalBytes) * 100);
                if (pct !== lastScanPct) {
                  lastScanPct = pct;
                  send("progress", { phase: "scanning", current: pct, total: 100 });
                }
              });
              send("progress", { phase: "scanning", current: 100, total: 100 });
              const epgN = bundle.phase3?.epgPrograms?.length ?? 0;
              send("status", {
                message: `Parse complete — importing into database (${bundle.streams.length} streams, ${bundle.lines.length} lines, ${epgN} EPG programmes)…`,
              });
              // Import the bundle directly
              const { applyMigrationBundle } = await import("@/lib/panel-migration/apply");
              const result = await applyMigrationBundle(bundle, { ...opts, onProgress });
              const preview = previewMigrationBundle(bundle);
              // Keep the completion payload small — huge warning lists / table dumps
              // spike CPU+RAM when serializing the SSE "complete" event.
              if (Array.isArray(preview.warnings) && preview.warnings.length > 40) {
                preview.warnings = [
                  ...preview.warnings.slice(0, 40),
                  `… ${preview.warnings.length - 40} more warnings omitted`,
                ];
              }
              if (Array.isArray(result.warnings) && result.warnings.length > 40) {
                result.warnings = [
                  ...result.warnings.slice(0, 40),
                  `… ${result.warnings.length - 40} more warnings omitted`,
                ];
              }
              send("complete", { preview, result });
              // Help GC release the parsed dump sooner on large imports.
              (bundle as { streams?: unknown }).streams = [];
              (bundle as { lines?: unknown }).lines = [];
              if (bundle.phase3) {
                bundle.phase3.epgPrograms = [];
                bundle.phase3.epgApiChannels = [];
                bundle.phase3.providerStreamLinks = [];
                bundle.phase3.blockedAsns = [];
              }
            } else {
              content = (uploadedContent ?? (body.content as string | undefined) ?? "").trim();
              if (!content) {
                send("error", { error: "content required" });
                controller.close();
                await cleanup();
                return;
              }
              const fileFormat = format === "json" || source === "nexlify_json" ? "json" : "sql";
              const out = await runMigration(content, source, fileFormat, { ...opts, onProgress });
              send("complete", { preview: out.preview, result: out.result });
            }
          }
        } catch (e) {
          send("error", { error: e instanceof Error ? e.message : String(e) });
        }

        controller.close();
        await cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    await cleanup();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}