import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEnigmaMac } from "@/lib/enigma";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const lineId = String(body.lineId ?? "");
  const macs: string[] = body.macs ?? [];
  const model = body.model ? String(body.model) : null;

  if (!lineId || !macs.length) {
    return NextResponse.json({ error: "lineId and macs required" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  for (const raw of macs) {
    const mac = normalizeEnigmaMac(String(raw));
    if (!mac) {
      skipped++;
      continue;
    }
    try {
      await prisma.enigmaDevice.create({ data: { mac, lineId, model } });
      imported++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped });
}
