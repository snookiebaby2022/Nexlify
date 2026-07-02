import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

interface InvoiceResult {
  invoiceDescription: string;
  lineItems: { description: string; amount: number }[];
  notes: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { lineId, template, language } = body as {
      lineId?: string;
      template?: string;
      language?: string;
    };

    let lineData = null;

    if (lineId) {
      lineData = await prisma.line.findUnique({
        where: { id: lineId },
        include: {
          billingEvents: { orderBy: { createdAt: "desc" }, take: 20 },
          bouquets: {
            include: {
              bouquet: {
                include: {
                  streams: { include: { stream: { select: { name: true, type: true } } } },
                },
              },
            },
          },
        },
      });
    } else {
      const recentBilling = await prisma.billingEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { line: { select: { id: true, username: true } } },
      });
      lineData = { billingEvents: recentBilling, _global: true };
    }

    const packages = await prisma.package.findMany({ where: { isActive: true } });

    const input = {
      line: lineData,
      packages: packages.map((p) => ({
        name: p.name,
        description: p.description,
        creditCost: p.creditCost,
        days: p.days,
        maxLines: p.maxLines,
      })),
      template: template ?? "standard",
      language: language ?? "en",
    };

    const result = await aiChatJSON<InvoiceResult>(
      [
        {
          role: "system",
          content: `You are a professional invoice writer for an IPTV service provider. Generate clear, professional invoice descriptions.

Include:
- Service period and line details
- Package breakdown with individual line items
- Credit costs and billing history summary
- Any applicable notes about service terms

Use professional but clear language. Format currency appropriately.
Return JSON: { invoiceDescription: string, lineItems: [{ description, amount }], notes: string }`,
        },
        {
          role: "user",
          content: `Generate an invoice for this data:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
      { maxTokens: 1500 }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Invoice generator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
