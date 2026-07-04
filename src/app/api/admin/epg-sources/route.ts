import { NextRequest, NextResponse } from "next/server";
import { getEpgSources, addEpgSource, updateEpgSource, removeEpgSource, syncEpgSource, syncAllEpgSources, getMergedEpg } from "@/lib/custom-epg";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "sources") return NextResponse.json(await getEpgSources());
    if (action === "merged") {
      const channelId = sp.get("channelId");
      if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
      return NextResponse.json(await getMergedEpg(channelId));
    }
    return NextResponse.json(await getEpgSources());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  try {
    if (action === "add") {
      const source = await addEpgSource(body.source);
      return NextResponse.json(source);
    }
    if (action === "update") {
      const source = await updateEpgSource(body.id, body.updates);
      return NextResponse.json(source);
    }
    if (action === "remove") {
      const ok = await removeEpgSource(body.id);
      return NextResponse.json({ ok });
    }
    if (action === "sync") {
      const result = await syncEpgSource(body.id);
      return NextResponse.json(result);
    }
    if (action === "sync-all") {
      const result = await syncAllEpgSources();
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
