import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  MIGRATION_SOURCES,
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
    /** Opt-in — full epg_data can be huge; EPG source URLs use importEpg. */
    importEpgGuide: body.importEpgGuide === true,
    importBlockedAsns: body.importBlockedAsns !== false,
    importLogs: body.importLogs !== false,
    importStats: body.importStats !== false,
    importSettings: body.importSettings !== false,
    skipExistingLines: body.skipExistingLines !== false,
    skipExistingStreams: body.skipExistingStreams !== false,
    clearDataBeforeImport: Boolean(body.clearDataBeforeImport),
    /** Default true — match 1-stream Migration Guide (streams imported stopped). */
    importStreamsStopped: body.importStreamsStopped !== false,
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
        const preview = {
          source: bundle.source,
          counts: {
            bouquets: bundle.bouquets.length,
            streams: bundle.streams.length,
            lines: bundle.lines.length,
            resellers: bundle.resellers?.length ?? 0,
            magDevices: bundle.magDevices?.length ?? 0,
            enigmaDevices: bundle.enigmaDevices?.length ?? 0,
            categories: bundle.phase2?.categories.length ?? 0,
            servers: bundle.phase2?.servers.length ?? 0,
            epgSources: bundle.phase2?.epgSources.length ?? 0,
            packages:
              (bundle.packages?.length ?? 0) ||
              (bundle.phase2?.packages?.length ?? 0),
          },
          warnings: bundle.warnings ?? [],
          tablesFound: bundle.tablesFound ?? [],
        };
        return NextResponse.json({ preview });
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
        send("start", { phase: "initializing" });

        try {
          const onProgress = (phase: string, current: number, total: number) => {
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
              send("progress", { phase: "scanning", current: 0, total: 100 });
              const bundle = await bundleFromSqlFile(filePath, source, (bytesRead, totalBytes) => {
                const pct = Math.round((bytesRead / totalBytes) * 100);
                send("progress", { phase: "scanning", current: pct, total: 100 });
              });
              send("progress", { phase: "scanning", current: 100, total: 100 });
              // Import the bundle directly
              const { applyMigrationBundle } = await import("@/lib/panel-migration/apply");
              const result = await applyMigrationBundle(bundle, { ...opts, onProgress });
              send("complete", {
                preview: {
                  source: bundle.source,
                  counts: {
                    bouquets: bundle.bouquets.length,
                    streams: bundle.streams.length,
                    lines: bundle.lines.length,
                    resellers: bundle.resellers?.length ?? 0,
                    magDevices: bundle.magDevices?.length ?? 0,
                    enigmaDevices: bundle.enigmaDevices?.length ?? 0,
                    categories: bundle.phase2?.categories.length ?? 0,
                    servers: bundle.phase2?.servers.length ?? 0,
                    epgSources: bundle.phase2?.epgSources.length ?? 0,
                    packages:
                      (bundle.packages?.length ?? 0) ||
                      (bundle.phase2?.packages?.length ?? 0),
                  },
                  warnings: bundle.warnings ?? [],
                  tablesFound: bundle.tablesFound ?? [],
                },
                result,
              });
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
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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