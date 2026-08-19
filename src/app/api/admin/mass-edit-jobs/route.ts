import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobs = await prisma.massEditJob.findMany({
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

  const job = await prisma.massEditJob.create({
    data: {
      entity: (body.entity ?? body.entityType ?? "STREAMS") as
        | "LINES"
        | "STREAMS"
        | "CHANNELS"
        | "MOVIES"
        | "SERIES"
        | "BOUQUETS"
        | "RESELLERS"
        | "MAG_DEVICES"
        | "ENIGMA_DEVICES",
      action: body.action ?? "update",
      filter: body.filter ?? {},
      changes: body.changes ?? {},
      status: "QUEUED",
      createdById: session.id,
    },
  });
  return NextResponse.json({ job });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
