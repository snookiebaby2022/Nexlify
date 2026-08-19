import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  generateStreamFingerprint,
  getStreamFingerprints,
  detectFingerprintMatches,
  markStreamAsPirated,
} from "@/lib/stream-fingerprinting";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [fingerprints, matches] = await Promise.all([
    getStreamFingerprints(),
    detectFingerprintMatches(),
  ]);

  return NextResponse.json({ fingerprints, matches });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, streamId } = parsed.data;

  if (action === "generate") {
    const fp = await generateStreamFingerprint(streamId);
    return NextResponse.json(fp);
  }

  if (action === "mark_pirated") {
    await markStreamAsPirated(streamId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
