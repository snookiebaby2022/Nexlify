import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { flagStream, getModerationFlags, reviewFlag } from "@/lib/content-moderation";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const flags = await getModerationFlags();
  return NextResponse.json({ flags });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, streamId, reason, severity, flagId, status } = await req.json();

  if (action === "flag") {
    const flag = await flagStream(streamId, reason, severity);
    return NextResponse.json(flag);
  }

  if (action === "review") {
    await reviewFlag(flagId, status);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
