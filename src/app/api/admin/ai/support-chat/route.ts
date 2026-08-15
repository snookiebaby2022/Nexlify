import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChat, isAiConfigured } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const SYSTEM_PROMPT = `You are a helpful AI support assistant for Nexlify IPTV Panel. Answer user questions about:

DEVICE SETUP:
- Firestick: Install IPTV Smarters or TiviMate from Downloader app, enter server URL and credentials
- Android: Use IPTV Smarters, TiviMate, or XCIPTV from Play Store
- Smart TV (Samsung/LG): Use Smart IPTV (SIPTV) app or install via USB
- iOS: Use IPTV Smarters or GSE Smart IPTV
- MAG Devices: Enter portal URL in Settings → Servers → Portal URL
- Enigma2/Vu+: Use DreamboxEnigma2 plugin or cross-env setup

TROUBLESHOOTING:
- Buffering: Check internet speed (minimum 10Mbps for HD, 25Mbps for 4K), try different server, reduce quality
- Black screen: Restart app, clear cache, verify credentials are correct
- EPG not loading: Refresh EPG data, check if EPG source is active
- Connection issues: Verify username/password, check if line is active and not expired

BILLING:
- Credits are used to create and renew lines
- Each package has a credit cost visible in the Packages section
- Credit transactions are logged in Billing → Credit History

Bouquet/LINE MANAGEMENT:
- Lines are assigned to bouquets which control channel access
- Max connections setting limits simultaneous streams per line
- Line expiry date controls when access ends
- Device binding can lock lines to specific devices

Keep responses concise and helpful. If you don't know the answer, say so honestly.`;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { message, sessionId } = body as { message: string; sessionId?: string };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!isAiConfigured()) {
      // Offline FAQ fallback so Support Chat still works without OPENAI_API_KEY
      const q = message.toLowerCase();
      let reply =
        "AI is not configured (missing OPENAI_API_KEY). Quick tips: Bouquets → Manage Bouquets; Live streams under Live / Radio / Channel; Movies/Series under VOD; Tickets → Open/Closed. Add OPENAI_API_KEY to .env for full AI answers.";
      if (q.includes("bouquet")) {
        reply =
          "Bouquets are under the Bouquets sidebar group → Manage Bouquets. Assign them on Create Line (Bouquets step) and under Bouquet Access for resellers.";
      } else if (q.includes("epg")) {
        reply = "EPG → Add Source with an XMLTV URL, then Auto-Match or Channel Map.";
      } else if (q.includes("line") || q.includes("subscription")) {
        reply = "Subscriptions → Add Line. Choose bouquets before Create line. Resellers need Bouquet Access first.";
      } else if (q.includes("reseller")) {
        reply =
          "If resellers see no bouquets, open Bouquets → Bouquet Access or run Repair import so ResellerBouquet links are created.";
      }
      return NextResponse.json({ reply, sessionId: sessionId || randomUUID(), offline: true });
    }

    const chatSessionId = sessionId || randomUUID();

    const history = await prisma.aiSupportChat.findMany({
      where: { sessionId: chatSessionId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await aiChat(messages, { maxTokens: 1024 });

    await prisma.aiSupportChat.createMany({
      data: [
        { sessionId: chatSessionId, role: "user", content: message },
        { sessionId: chatSessionId, role: "assistant", content: response },
      ],
    });

    return NextResponse.json({ reply: response, sessionId: chatSessionId });
  } catch (error) {
    console.error("Support chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
