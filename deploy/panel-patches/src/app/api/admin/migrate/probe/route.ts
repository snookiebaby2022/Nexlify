import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { probeMigrationPostgres, type PostgresMigrationConfig } from "@/lib/panel-migration";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const pg = body.pg as PostgresMigrationConfig | undefined;
  if (!pg?.connectionString && !(pg?.host && pg?.database && pg?.user)) {
    return NextResponse.json(
      { error: "pg.connectionString or pg.host/database/user required" },
      { status: 400 }
    );
  }

  try {
    const probe = await probeMigrationPostgres(pg);
    return NextResponse.json({ probe });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
