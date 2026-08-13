import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public ingest for IPTV panel Suggestions / Reports → marketing admin tickets.
 * Panels POST here via forwardPanelFeedbackToVendor.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind ?? "SUGGESTION").toUpperCase();
    const subject = String(body.subject ?? "").trim().slice(0, 200);
    const text = String(body.body ?? "").trim().slice(0, 10000);
    const panelHost = String(body.panelHost ?? "").trim().slice(0, 200);
    const username = String(body.username ?? "").trim().slice(0, 120);

    if (!subject || text.length < 5) {
      return NextResponse.json({ error: "subject and body required" }, { status: 400 });
    }

    // Attach to primary admin (or first user) so it shows in marketing Support.
    const admin =
      (await prisma.user.findFirst({
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
      })) ?? (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));

    if (!admin) {
      return NextResponse.json({ error: "No marketing admin user to attach feedback" }, { status: 503 });
    }

    const fullSubject = `[Panel ${kind}] ${subject}`.slice(0, 200);
    const fullBody = [
      text,
      "",
      "—",
      panelHost ? `Panel: ${panelHost}` : null,
      username ? `From: ${username}` : null,
      `Kind: ${kind}`,
      `Source: nexlify-panel`,
    ]
      .filter(Boolean)
      .join("\n");

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          userId: admin.id,
          subject: fullSubject,
          priority: kind === "REPORT" || kind === "BUG" ? "HIGH" : "NORMAL",
        },
      });
      await tx.ticketMessage.create({
        data: {
          ticketId: created.id,
          authorId: admin.id,
          body: fullBody,
          isStaff: false,
        },
      });
      return created;
    });

    return NextResponse.json({ ok: true, ticketId: ticket.id });
  } catch (e) {
    console.error("[panel-feedback]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to store feedback" },
      { status: 500 }
    );
  }
}
