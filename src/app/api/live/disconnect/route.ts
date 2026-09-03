import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { getLineForPlaybackAuth } from "@/lib/line-playback";
import { lineIsPlayable } from "@/lib/lines";
import { removeConnection } from "@/lib/connections";

import { apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  let body: { username?: string; password?: string; streamId?: string } | null = null;

  try {
    body = await req.json();
  } catch {
    // navigator.sendBeacon sends as text/plain
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
  }

  if (!body?.username || !body?.password || !body?.streamId) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const line = await getLineForPlaybackAuth(body.username);
  if (!line || line.password !== body.password || !lineIsPlayable(line)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req) ?? "unknown";
  await removeConnection(line.id, body.streamId, ip);
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
