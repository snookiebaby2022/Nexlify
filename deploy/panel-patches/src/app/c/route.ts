import { NextRequest, NextResponse } from "next/server";
import { serverBaseUrl } from "@/lib/xtream";
import { resolveServerUrls } from "@/lib/server-urls";

/** MAG portal entry — configure STB with this URL + device MAC in panel */
export async function GET(req: NextRequest) {
  const origin = serverBaseUrl(req.url, req.headers);
  const urls = await resolveServerUrls(origin);
  const portal =
    urls.magServerUrl ||
    `${origin}/stalker_portal/server/load.php`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Nexlify MAG Portal</title></head>
<body style="font-family:sans-serif;background:#0b1220;color:#e8eef9;padding:2rem">
<h1>Nexlify MAG / Stalker Portal</h1>
<p>Set your MAG box portal URL to:</p>
<pre style="background:#111b2e;padding:1rem;border-radius:8px">${portal}</pre>
<p>Register the device MAC under <strong>Admin → MAG Devices</strong> and link it to a line.</p>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
