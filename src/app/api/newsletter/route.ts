import { NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = rateLimit(`newsletter:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);
  let body: { email?: string; source?: string; sequence?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const source = body.source?.trim() || "nexlify.live";
  const sequence = body.sequence?.trim() || null;
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const webhook = process.env.NEWSLETTER_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          sequence,
          ts: new Date().toISOString(),
        }),
      });
    } catch {
      return NextResponse.json({ error: "Webhook failed" }, { status: 502 });
    }
  } else {
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    await appendFile(
      path.join(dir, "newsletter-subscribers.log"),
      `${new Date().toISOString()}\t${email}\t${source}${sequence ? `\t${sequence}` : ""}\n`,
      "utf8",
    );
  }

  return NextResponse.json({ ok: true });
}
