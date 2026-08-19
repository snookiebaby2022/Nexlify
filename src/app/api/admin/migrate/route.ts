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
import Busboy from "busboy";
import { Readable } from "stream";
import { unlink } from "fs/promises";
import { createWriteStream } from "fs";
import {
  findLatestMigrateUpload,
  reconcileMigrateJob,
  startMigrateBackgroundJob,
  type MigrateJob,
} from "@/lib/panel-migrate-job";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
const SOURCES = new Set(MIGRATION_SOURCES.map((s) => s.id));

/** Large SQL dumps are uploaded as multipart/form-data to avoid loading them in the browser. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function sseWatchJob(jobId: string, keepFile: boolean, filePath?: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("start", {
        phase: "initializing",
        message: "Migration worker started (survives panel restarts)…",
        jobId,
      });
      let lastMsg = "";
      let lastProg = "";
      const cleanup = async () => {
        if (!keepFile && filePath) {
          try {
            await unlink(filePath);
          } catch {
            /* ignore */
          }
        }
      };
      try {
        for (let i = 0; i < 7200; i++) {
          // up to ~2h at 1s
          const job = (await reconcileMigrateJob()) as MigrateJob | null;
          if (!job || job.id !== jobId) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          if (job.message && job.message !== lastMsg) {
            lastMsg = job.message;
            send("status", { message: job.message });
          }
          if (job.progress) {
            const key = `${job.progress.phase}:${job.progress.current}:${job.progress.total}`;
            if (key !== lastProg) {
              lastProg = key;
              send("progress", job.progress);
            }
          }
          if (job.status === "done") {
            send("complete", {
              preview: job.preview,
              result: job.result,
              jobId: job.id,
            });
            await cleanup();
            controller.close();
            return;
          }
          if (job.status === "failed") {
            send("error", { error: job.error || job.message || "Migration failed" });
            await cleanup();
            controller.close();
            return;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        send("error", {
          error:
            "Timed out waiting for migration worker. If the panel restarted, click Resume last upload.",
        });
      } catch (e) {
        send("error", { error: e instanceof Error ? e.message : String(e) });
      }
      controller.close();
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
}

async function startBackgroundAndWatch(
  filePath: string,
  source: MigrationSource,
  opts: ReturnType<typeof applyOptions>,
  keepFile: boolean
): Promise<Response> {
  const started = await startMigrateBackgroundJob({
    filePath,
    source,
    dryRun: opts.dryRun,
    options: opts as unknown as Record<string, unknown>,
  });
  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: 409 });
  }
  return sseWatchJob(started.job.id, keepFile, filePath);
}

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
      req.body as unknown as import("stream/web").ReadableStream,
    );
    nodeStream.pipe(busboy as unknown as NodeJS.WritableStream);
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
  const lastUpload = await findLatestMigrateUpload();
  const job = await reconcileMigrateJob();
  return NextResponse.json({
    sources: MIGRATION_SOURCES,
    lastUpload: lastUpload
      ? { size: lastUpload.size, mtimeMs: lastUpload.mtimeMs }
      : null,
    job: job
      ? {
          id: job.id,
          status: job.status,
          phase: job.progress?.phase ?? null,
          current: job.progress?.current ?? null,
          total: job.progress?.total ?? null,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseRequestBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  let { body, content: uploadedContent, filePath } = parsed;

  // Resume / watch without re-uploading a ~1GB dump
  if (body.action === "watchJob" && typeof body.jobId === "string") {
    const job = await reconcileMigrateJob();
    if (!job || job.id !== body.jobId) {
      return NextResponse.json({ error: "Migration job not found" }, { status: 404 });
    }
    return sseWatchJob(job.id, true, job.filePath);
  }
  if (body.action === "jobStatus") {
    const job = await reconcileMigrateJob();
    return NextResponse.json({ job });
  }
  if (body.resumeLatestUpload === true || body.action === "resumeLatestUpload") {
    const latest = await findLatestMigrateUpload();
    if (!latest) {
      return NextResponse.json(
        { error: "No recent uploaded SQL dump found on the server (/tmp)." },
        { status: 404 }
      );
    }
    filePath = latest.path;
    if (!body.source) {
      return NextResponse.json({ error: "source required" }, { status: 400 });
    }
  }
  if (typeof body.existingFilePath === "string" && body.existingFilePath.startsWith("/tmp/nexlify-migrate-")) {
    filePath = body.existingFilePath;
  }

  const source = body.source as MigrationSource;
  if (!SOURCES.has(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const format = body.format as string | undefined;
  const opts = applyOptions(body);

  try {
    // Large dumps: detached worker so pm2/rebuild cannot kill mid-scan
    if (filePath) {
      return await startBackgroundAndWatch(filePath, source, opts, true);
    }

    // For dry runs, return JSON directly (fast) — small/pasted content only
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
        return NextResponse.json({
          preview: out.preview,
          probe: out.probe,
        });
      }

      const content = (uploadedContent ?? (body.content as string | undefined) ?? "").trim();
      if (!content) {
        return NextResponse.json({ error: "content required" }, { status: 400 });
      }

      const fileFormat = format === "json" || source === "nexlify_json" ? "json" : "sql";
      const out = await runMigration(content, source, fileFormat, opts);
      return NextResponse.json({ preview: out.preview });
    }

    // Small/pasted imports (and postgres): SSE in-process
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        send("start", { phase: "initializing", message: "Starting import…" });

        try {
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
            const content = (uploadedContent ?? (body.content as string | undefined) ?? "").trim();
            if (!content) {
              send("error", { error: "content required" });
              controller.close();
              return;
            }
            const fileFormat = format === "json" || source === "nexlify_json" ? "json" : "sql";
            const out = await runMigration(content, source, fileFormat, { ...opts, onProgress });
            send("complete", { preview: out.preview, result: out.result });
          }
        } catch (e) {
          send("error", { error: e instanceof Error ? e.message : String(e) });
        }
        controller.close();
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
