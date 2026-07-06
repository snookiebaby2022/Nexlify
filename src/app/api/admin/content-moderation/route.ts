import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { flagStream, getModerationFlags, reviewFlag, deleteFlag } from "@/lib/content-moderation";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const flags = await getModerationFlags(status ?? undefined);
  return NextResponse.json({ flags });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action === "flag") {
    const { streamId, reason, severity } = body;
    if (!streamId || !reason) {
      return NextResponse.json({ error: "streamId and reason required" }, { status: 400 });
    }
    const flag = await flagStream(streamId, reason, severity ?? "medium");
    return NextResponse.json(flag);
  }

  if (action === "review") {
    const { flagId, status } = body;
    if (!flagId || !status) {
      return NextResponse.json({ error: "flagId and status required" }, { status: 400 });
    }
    const ok = await reviewFlag(flagId, status, session.user?.name ?? undefined);
    return NextResponse.json({ ok });
  }

  if (action === "delete") {
    const { flagId } = body;
    if (!flagId) {
      return NextResponse.json({ error: "flagId required" }, { status: 400 });
    }
    const ok = await deleteFlag(flagId);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
