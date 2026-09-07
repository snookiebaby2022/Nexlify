import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FingerprintType, PanelRole } from "@prisma/client";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

const TYPE_MAP: Record<string, FingerprintType> = {
  INVISIBLE: FingerprintType.INVISIBLE_WATERMARK,
  INVISIBLE_WATERMARK: FingerprintType.INVISIBLE_WATERMARK,
  VIDEO: FingerprintType.INVISIBLE_WATERMARK,
  AUDIO: FingerprintType.SESSION_HASH,
  FRAME: FingerprintType.TOKEN_SIGNATURE,
  TOKEN_SIGNATURE: FingerprintType.TOKEN_SIGNATURE,
  SESSION_HASH: FingerprintType.SESSION_HASH,
};

function mapRow(row: {
  id: string;
  token: string;
  type: FingerprintType;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  stream: { name: string };
  line: { username: string };
}) {
  return {
    id: row.id,
    streamName: row.stream.name,
    lineUsername: row.line.username,
    token: row.token,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? "",
    active: row.isActive,
    detections: 0,
  };
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fingerprints = await prisma.streamFingerprint.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      stream: { select: { name: true } },
      line: { select: { username: true } },
    },
  });

  const now = Date.now();
  const mapped = fingerprints.map(mapRow);
  const stats = {
    total: fingerprints.length,
    active: fingerprints.filter((f) => f.isActive && (!f.expiresAt || f.expiresAt.getTime() > now)).length,
    inactive: fingerprints.filter((f) => !f.isActive).length,
    totalActive: fingerprints.filter((f) => f.isActive && (!f.expiresAt || f.expiresAt.getTime() > now)).length,
    totalExpired: fingerprints.filter((f) => f.expiresAt && f.expiresAt.getTime() <= now).length,
    recentDetections: 0,
  };

  return NextResponse.json({ fingerprints: mapped, stats });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const streamId = String(body.streamId ?? "").trim();
    const lineId = String(body.lineId ?? "").trim();
    if (!streamId || !lineId) {
      return NextResponse.json({ error: "streamId and lineId are required" }, { status: 400 });
    }

    const [stream, line] = await Promise.all([
      prisma.stream.findUnique({ where: { id: streamId }, select: { id: true } }),
      prisma.line.findUnique({ where: { id: lineId }, select: { id: true } }),
    ]);
    if (!stream) return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

    const type = TYPE_MAP[String(body.type ?? "INVISIBLE_WATERMARK")] ?? FingerprintType.INVISIBLE_WATERMARK;
    const ttlHours = Math.max(1, Math.min(24 * 90, Number(body.ttlHours ?? 24) || 24));
    const token = createHash("sha256")
      .update(`${streamId}|${lineId}|${randomBytes(16).toString("hex")}`)
      .digest("hex")
      .slice(0, 32);

    const created = await prisma.streamFingerprint.create({
      data: {
        streamId,
        lineId,
        type,
        token,
        isActive: true,
        expiresAt: new Date(Date.now() + ttlHours * 3600_000),
        payload: { source: "admin" },
      },
      include: {
        stream: { select: { name: true } },
        line: { select: { username: true } },
      },
    });

    return NextResponse.json({ ok: true, fingerprint: mapRow(created) });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
