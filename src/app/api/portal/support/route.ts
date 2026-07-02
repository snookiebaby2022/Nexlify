import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-session";
import { sendPanelEmail, panelReportRecipient } from "@/lib/panel-email";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "Message must be at least 10 characters" }, { status: 400 });
  }

  // Get line details for context
  const line = await prisma.line.findUnique({
    where: { id: session.lineId },
    select: { username: true, status: true, expiresAt: true },
  });

  const to = panelReportRecipient();
  if (!to) {
    return NextResponse.json({ error: "Support email not configured" }, { status: 503 });
  }

  try {
    await sendPanelEmail({
      to,
      subject: `[Portal Support] ${subject} (from ${session.username})`,
      text: `Portal Support Request\n\nFrom: ${session.username}\nLine Status: ${line?.status ?? "unknown"}\nExpires: ${line?.expiresAt ? new Date(line.expiresAt).toLocaleString() : "unknown"}\n\nSubject: ${subject}\n\nMessage:\n${message}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
