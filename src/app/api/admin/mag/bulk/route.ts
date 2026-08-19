import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { normalizeMac } from "@/lib/mag";
import { prisma } from "@/lib/prisma";
import { assertOwnedLine } from "@/lib/device-access";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const lineId = String(body.lineId ?? "");
  const model = body.model ?? null;
  const macs: string[] = body.macs ?? [];

  if (!lineId) return NextResponse.json({ error: "lineId required" }, { status: 400 });
  if (!macs.length) return NextResponse.json({ error: "macs required" }, { status: 400 });

  try {
    await assertOwnedLine(session, lineId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  let imported = 0;
  let skipped = 0;

  const validMacs: string[] = [];
  for (const raw of macs) {
    const mac = normalizeMac(String(raw).trim());
    if (!mac || mac.length < 11) {
      skipped++;
      continue;
    }
    validMacs.push(mac);
  }

  if (validMacs.length > 0) {
    await prisma.$transaction(
      validMacs.map((mac) =>
        prisma.magDevice.upsert({
          where: { mac },
          update: { lineId, model, isActive: true },
          create: { mac, lineId, model },
        })
      )
    );
    imported = validMacs.length;
  }

  return NextResponse.json({ imported, skipped });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
