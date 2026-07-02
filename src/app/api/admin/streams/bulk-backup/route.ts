import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { PanelRole } from "@prisma/client";

type ParsedRow = { key: string; backupUrl: string };

function parseBulkLines(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : ",";
    const parts = line.split(sep).map((p) => p.trim());
    if (parts.length < 2) continue;
    const backupUrl = parts[parts.length - 1];
    const key = parts.slice(0, -1).join(sep).trim();
    if (!key || !backupUrl) continue;
    rows.push({ key, backupUrl });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const mode = String(body.mode ?? "map");
  const dryRun = body.dryRun === true;

  if (mode === "map") {
    const text = String(body.text ?? "");
    const rows = parseBulkLines(text);
    if (!rows.length) {
      return NextResponse.json({ error: "No valid rows — use stream_id|backup_url or name|backup_url per line" }, { status: 400 });
    }

    const streams = await prisma.stream.findMany({
      select: { id: true, name: true, backupUrl: true },
    });
    const byId = new Map(streams.map((s) => [s.id, s]));
    const byName = new Map<string, typeof streams[0]>();
    for (const s of streams) {
      byName.set(s.name.toLowerCase(), s);
    }

    const updates: { id: string; name: string; backupUrl: string; previous: string | null }[] = [];
    const unmatched: string[] = [];

    for (const row of rows) {
      const match =
        byId.get(row.key) ??
        byName.get(row.key.toLowerCase()) ??
        streams.find((s) => s.id.startsWith(row.key));
      if (!match) {
        unmatched.push(row.key);
        continue;
      }
      updates.push({
        id: match.id,
        name: match.name,
        backupUrl: row.backupUrl,
        previous: match.backupUrl,
      });
    }

    if (!dryRun) {
      for (const u of updates) {
        await prisma.stream.update({
          where: { id: u.id },
          data: { backupUrl: u.backupUrl },
        });
      }
      await logActivity("bulk_backup_urls", {
        userId: session.id,
        entity: "stream",
        meta: { count: updates.length, unmatched: unmatched.length },
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      updated: updates.length,
      unmatched,
      preview: updates.slice(0, 50),
    });
  }

  if (mode === "clearMissingPrimary") {
    const streams = await prisma.stream.findMany({
      where: { OR: [{ streamUrl: "" }, { streamUrl: null as never }] },
      select: { id: true },
    });
    if (!dryRun && streams.length) {
      await prisma.stream.updateMany({
        where: { id: { in: streams.map((s) => s.id) } },
        data: { backupUrl: null },
      });
    }
    return NextResponse.json({ ok: true, cleared: streams.length, dryRun });
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [total, withBackup, withoutPrimary] = await Promise.all([
    prisma.stream.count({ where: { type: "LIVE" } }),
    prisma.stream.count({ where: { type: "LIVE", backupUrl: { not: null }, NOT: { backupUrl: "" } } }),
    prisma.stream.count({
      where: {
        type: "LIVE",
        OR: [{ streamUrl: "" }, { streamUrl: null as never }],
        backupUrl: { not: null },
        NOT: { backupUrl: "" },
      },
    }),
  ]);

  return NextResponse.json({ total, withBackup, withoutPrimary });
}
