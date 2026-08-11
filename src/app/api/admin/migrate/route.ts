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

async function parseRequestBody(req: NextRequest): Promise<
  | { ok: true; body: Record<string, unknown>; content?: string }
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

  const { body, content: uploadedContent } = parsed;
  const source = body.source as MigrationSource;
  if (!SOURCES.has(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const format = body.format as string | undefined;
  const opts = applyOptions(body);

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
        return NextResponse.json({
          preview: out.preview,
          probe: out.probe,
        });
      }

      const content = (uploadedContent ?? (body.content as string | undefined))?.trim();
      if (!content) {
        return NextResponse.json({ error: "content required" }, { status: 400 });
      }
      const fileFormat = format === "json" || source === "nexlify_json" ? "json" : "sql";
      const out = await runMigration(content, source, fileFormat, opts);
      return NextResponse.json({ preview: out.preview });
    }

    // For actual imports, stream progress via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

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
            const content = (uploadedContent ?? (body.content as string | undefined))?.trim();
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
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
