import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getSocialPlatforms, getActiveSocialStreams, startSocialStream, endSocialStream, updateSocialPlatform, getSocialStats } from "@/lib/social-integration";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "platforms") return NextResponse.json(await getSocialPlatforms());
    if (action === "active") return NextResponse.json(await getActiveSocialStreams());
    if (action === "stats") return NextResponse.json(await getSocialStats());
    return NextResponse.json(await getSocialStats());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authSession = await requireSession([PanelRole.ADMIN]);
  if (!authSession) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  try {
    if (body.action === "start") {
      const session = await startSocialStream(body.platformId, body.streamId, body.title);
      return NextResponse.json(session);
    }
    if (body.action === "end") {
      return NextResponse.json({ ok: await endSocialStream(body.sessionId) });
    }
    if (body.action === "update") {
      return NextResponse.json({ ok: await updateSocialPlatform(body.platformId, body.updates) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
