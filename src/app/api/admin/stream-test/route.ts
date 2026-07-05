import { NextRequest, NextResponse } from "next/server";
import { testStream, testAllStreams, getStreamTestResult, getFailedStreams } from "@/lib/stream-testing";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

export async function OPTIONS() { return iptvCorsPreflight(); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "all") return NextResponse.json(await testAllStreams());
    if (action === "failed") return NextResponse.json(await getFailedStreams());
    const streamId = sp.get("streamId");
    if (streamId) return NextResponse.json(await getStreamTestResult(streamId));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    if (body.action === "test") {
      return NextResponse.json(await testStream(body.streamId));
    }
    if (body.action === "test-all") {
      return NextResponse.json(await testAllStreams());
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
