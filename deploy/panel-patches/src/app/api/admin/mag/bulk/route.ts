import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { normalizeMac } from "@/lib/mag";
import { prisma } from "@/lib/prisma";
import { assertOwnedLine } from "@/lib/device-access";
import { PanelRole } from "@prisma/client";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function POST(req: NextRequest) {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
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

  for (const raw of macs) {
    const mac = normalizeMac(String(raw).trim());
    if (!mac || mac.length < 11) {
      skipped++;
      continue;
    }
    try {
      await prisma.magDevice.upsert({
        where: { mac },
        update: { lineId, model, isActive: true },
        create: { mac, lineId, model },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped });
}
