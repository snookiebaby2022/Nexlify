import { NextRequest, NextResponse } from "next/server";
import { buildPanelPlayerApiUrl, looksLikeHtml } from "@/lib/webplayer-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const server = sp.get("server");
  const username = sp.get("username");
  const password = sp.get("password");
  const action = sp.get("action");

  if (!server || !username || !password) {
    return NextResponse.json({ error: "Missing server, username, or password" }, { status: 400 });
  }

  const extra: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key === "server" || key === "username" || key === "password" || key === "action") continue;
    extra[key] = value;
  }

  let targetUrl: string;
  try {
    targetUrl = buildPanelPlayerApiUrl(server, username, password, action || undefined, extra);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid server URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Nexlify-WebPlayer/1.0",
      },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const text = await res.text();

    if (looksLikeHtml(text)) {
      return NextResponse.json(
        {
          error:
            "Panel returned a web page instead of API data. Use your IPTV panel URL (e.g. https://panel.nexlify.live).",
        },
        { status: 502 }
      );
    }

    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach your IPTV panel. Check the server URL and try again." },
      { status: 502 }
    );
  }
}
