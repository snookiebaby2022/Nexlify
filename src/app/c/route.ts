import { NextRequest, NextResponse } from "next/server";
import { magPortalUrl, stalkerPortalUrl } from "@/lib/mag";
import { resolveServerUrls } from "@/lib/server-urls";
import { serverBaseUrl } from "@/lib/xtream";
import { handleStalkerPortalRequest, isStalkerPortalRequest } from "@/lib/stalker-portal-handle";

async function handle(req: NextRequest) {
  if (req.method === "GET" && !isStalkerPortalRequest(req)) {
    return magPortalHelpPage(req);
  }
  return handleStalkerPortalRequest(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handleStalkerPortalRequest(req);
}

function magPortalHelpPage(req: NextRequest) {
  const origin = serverBaseUrl(req.url, req.headers);
  const magUrl = magPortalUrl(origin);
  const stalkerUrl = stalkerPortalUrl(origin);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Nexlify MAG Portal</title></head>
<body style="font-family:sans-serif;background:#0b1220;color:#e8eef9;padding:2rem">
<h1>Nexlify MAG / Stalker Portal</h1>
<p>Set your MAG box portal URL to:</p>
<pre style="background:#111b2e;padding:1rem;border-radius:8px">${magUrl}</pre>
<p>Alternate full path (same API):</p>
<pre style="background:#111b2e;padding:1rem;border-radius:8px">${stalkerUrl}</pre>
<p>Register the device MAC under <strong>Admin → MAG Devices</strong> and link it to a line.</p>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
