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
import { writeFile, unlink, readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";

const SOURCES = new Set(MIGRATION_SOURCES.map((s) => s.id));

/** Large SQL dumps are uploaded as multipart/form-data to avoid loading them in the browser. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/** For files larger than this, use streaming instead of loading into memory */
const STREAMING_THRESHOLD = 50 * 1024 * 1024; // 50MB

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
    skipExistingLines: body.skipExistingLines !== false,
    skipExistingStreams: body.skipExistingStreams !== false,
    defaultServerId: (body.defaultServerId as string) ?? null,
    ownerId: (body.ownerId as string) ?? null,
  };
}

function parseBodyRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Stream file to disk and return path */
async function streamFileToDisk(file: File): Promise<string> {
  const tempPath = `/tmp/nexlify-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`;
  const stream = file.stream() as unknown as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  await writeFile(tempPath, combined);
  return tempPath;
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

/** Stream-read SQL file and return content string.
 *  For very large files this still loads into memory — the single-pass parser handles it efficiently. */
async function parseSqlFileIncremental(
  filePath: string,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<string> {
  const fileStats = await stat(filePath);
  const totalBytes = fileStats.size;
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  let lastProgressBytes = 0;

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks
    stream.on("data", (chunk: Buffer) => {
      bytesRead += chunk.length;
      chunks.push(chunk);
      if (onProgress && bytesRead - lastProgressBytes > 10 * 1024 * 1024) {
        lastProgressBytes = bytesRead;
        onProgress(bytesRead, totalBytes);
      }
    });
    stream.on("end", () => {
      if (onProgress) onProgress(bytesRead, totalBytes);
      resolve(Buffer.concat(chunks).toString("utf8"));
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
    const form = await req.formData();
    const file = form.get("file");
    const payloadRaw = form.get("payload");

    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "file required", status: 400 };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`,
        status: 413,
      };
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

    // For large files, stream to disk and process incrementally
    if (file.size > STREAMING_THRESHOLD) {
      const filePath = await streamFileToDisk(file);
      return { ok: true, body, filePath };
    }

    // For small files, read into memory as before
    const content = (await file.text()).trim();
    if (!content) {
      return { ok: false, error: "Uploaded file is empty", status: 400 };
    }

    return { ok: true, body, content };
  }

  const body = parseBodyRecord(await req.json());
  if (!body) {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  return { ok: true, body };
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

      let content: string;
      
      if (filePath) {
        // For large files, parse incrementally
        content = await parseSqlFileIncremental(filePath);
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
            let content: string;
            
            if (filePath) {
              send("progress", { phase: "scanning", current: 0, total: 100 });
              content = await parseSqlFileIncremental(filePath, (bytesRead, totalBytes) => {
                const pct = Math.round((bytesRead / totalBytes) * 100);
                send("progress", { phase: "scanning", current: pct, total: 100 });
              });
              send("progress", { phase: "scanning", current: 100, total: 100 });
            } else {
              content = (uploadedContent ?? (body.content as string | undefined) ?? "").trim();
            }
            
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