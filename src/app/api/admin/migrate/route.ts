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

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ sources: MIGRATION_SOURCES });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const source = body.source as MigrationSource;
  if (!SOURCES.has(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const format = body.format as string | undefined;
  const opts = applyOptions(body);

  try {
    if (format === "postgres") {
      if (source !== "onestream") {
        return NextResponse.json(
          { error: "PostgreSQL live import is supported for 1-stream only" },
          { status: 400 }
        );
      }
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
        result: out.result,
        probe: out.probe,
      });
    }

    const content = (body.content as string | undefined)?.trim();
    if (!content) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    const fileFormat =
      format === "json" || source === "nexlify_json" ? "json" : "sql";

    const out = await runMigration(content, source, fileFormat, opts);
    return NextResponse.json({
      preview: out.preview,
      result: out.result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
