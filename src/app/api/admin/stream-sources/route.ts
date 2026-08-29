import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody } from "@/lib/parse-json-body";
import {
  EMPTY_SOURCE_ORIGIN,
  normalizeSourceOriginInput,
  rewriteUrlOrigin,
  streamSourceOrigin,
} from "@/lib/stream-source-hosts";

export const dynamic = "force-dynamic";

type SourceRow = {
  origin: string;
  streamCount: number;
  activeCount: number;
  onlineCount: number;
  offlineCount: number;
  types: { LIVE: number; MOVIE: number; SERIES: number };
  sampleNames: string[];
};

function emptyTypes(): SourceRow["types"] {
  return { LIVE: 0, MOVIE: 0, SERIES: 0 };
}

function bumpType(types: SourceRow["types"], type: string) {
  if (type === "MOVIE") types.MOVIE += 1;
  else if (type === "SERIES") types.SERIES += 1;
  else types.LIVE += 1;
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = (req.nextUrl.searchParams.get("search") ?? "").trim().toLowerCase();
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(10, parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50", 10) || 50)
  );

  const streams = await prisma.stream.findMany({
    select: {
      name: true,
      type: true,
      isActive: true,
      lastProbeOk: true,
      streamUrl: true,
      backupUrl: true,
    },
  });

  const map = new Map<string, SourceRow>();
  for (const s of streams) {
    const origins = new Set<string>([streamSourceOrigin(s.streamUrl)]);
    if (s.backupUrl) origins.add(streamSourceOrigin(s.backupUrl));
    for (const origin of origins) {
      let row = map.get(origin);
      if (!row) {
        row = {
          origin,
          streamCount: 0,
          activeCount: 0,
          onlineCount: 0,
          offlineCount: 0,
          types: emptyTypes(),
          sampleNames: [],
        };
        map.set(origin, row);
      }
      row.streamCount += 1;
      if (s.isActive) row.activeCount += 1;
      if (s.lastProbeOk === true) row.onlineCount += 1;
      else if (s.lastProbeOk === false) row.offlineCount += 1;
      bumpType(row.types, s.type);
      if (row.sampleNames.length < 3) row.sampleNames.push(s.name);
    }
  }

  let sources = [...map.values()].sort((a, b) => b.streamCount - a.streamCount || a.origin.localeCompare(b.origin));
  if (search) sources = sources.filter((r) => r.origin.includes(search) || r.sampleNames.some((n) => n.toLowerCase().includes(search)));
  const total = sources.length;
  const pageRows = sources.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ sources: pageRows, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody<{ from?: string; to?: string; dryRun?: boolean }>(req);
  if (!parsed.ok) return parsed.response;

  const from = normalizeSourceOriginInput(String(parsed.data.from ?? ""));
  const to = normalizeSourceOriginInput(String(parsed.data.to ?? ""));
  if (!from || from === EMPTY_SOURCE_ORIGIN) {
    return NextResponse.json({ error: "From source is required (host or http(s) origin)" }, { status: 400 });
  }
  if (!to || to === EMPTY_SOURCE_ORIGIN) {
    return NextResponse.json({ error: "To source is required (host or http(s) origin)" }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ error: "From and To are the same origin" }, { status: 400 });
  }

  const streams = await prisma.stream.findMany({
    select: { id: true, streamUrl: true, backupUrl: true },
  });

  const updates: { id: string; streamUrl: string; backupUrl: string | null }[] = [];
  for (const s of streams) {
    const nextUrl = rewriteUrlOrigin(s.streamUrl, from, to);
    const nextBackup = s.backupUrl ? rewriteUrlOrigin(s.backupUrl, from, to) : s.backupUrl;
    if (nextUrl !== s.streamUrl || nextBackup !== s.backupUrl) {
      updates.push({ id: s.id, streamUrl: nextUrl, backupUrl: nextBackup });
    }
  }

  if (parsed.data.dryRun) {
    return NextResponse.json({ updated: updates.length, from, to, dryRun: true });
  }

  for (const u of updates) {
    await prisma.stream.update({
      where: { id: u.id },
      data: { streamUrl: u.streamUrl, backupUrl: u.backupUrl },
    });
  }

  return NextResponse.json({ updated: updates.length, from, to });
}
