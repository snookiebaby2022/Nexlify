import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEnigmaMac } from "@/lib/enigma";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const lineId = String(body.lineId ?? "");
  const macs: string[] = body.macs ?? [];
  const model = body.model ? String(body.model) : null;

  if (!lineId || !macs.length) {
    return NextResponse.json({ error: "lineId and macs required" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  const validMacs: string[] = [];
  for (const raw of macs) {
    const mac = normalizeEnigmaMac(String(raw));
    if (!mac) {
      skipped++;
      continue;
    }
    validMacs.push(mac);
  }

  if (validMacs.length > 0) {
    const result = await prisma.enigmaDevice.createMany({
      data: validMacs.map((mac) => ({ mac, lineId, model })),
      skipDuplicates: true,
    });
    imported = result.count;
    skipped += validMacs.length - result.count;
  }

  return NextResponse.json({ imported, skipped });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
