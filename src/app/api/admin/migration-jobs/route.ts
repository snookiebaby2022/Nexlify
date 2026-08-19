import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
/**
 * DEPRECATED: Legacy migration job endpoints. No worker processes these jobs.
 * Use POST /api/admin/migrate for actual migrations (runs synchronously with SSE progress).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, MigrationSource } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobs = await prisma.migrationJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const source = (body.source as MigrationSource) ?? MigrationSource.XTREAM_UI;
  const job = await prisma.migrationJob.create({
    data: {
      source,
      sourceUrl: body.sourceUrl ?? "",
      status: "QUEUED",
      createdById: session.id,
    },
  });
  return NextResponse.json({ job });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
