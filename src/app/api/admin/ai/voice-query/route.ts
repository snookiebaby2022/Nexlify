import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON, aiTranscribe } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

const READ_ONLY_TABLES = [
  "Line",
  "Stream",
  "Package",
  "Bouquet",
  "LiveConnection",
  "CreditTransaction",
  "BillingEvent",
  "ConnectionGeography",
  "SameIpDetection",
  "StreamHealthCheck",
  "PanelUser",
];

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const transcription = await aiTranscribe(audioBuffer, audioFile.name);

    const start = Date.now();

    const queryPlan = await aiChatJSON<{
      intent: string;
      table: string;
      filter?: Record<string, unknown>;
      select?: string[];
      orderBy?: string;
      take?: number;
    }>(
      [
        {
          role: "system",
          content: `You translate natural language admin queries into structured Prisma-like read-only database queries.

Available tables: ${READ_ONLY_TABLES.join(", ")}

Rules:
- Only use SELECT/read operations. Never generate mutations.
- Map natural language to table names and field filters.
- Use reasonable defaults: take=20, orderBy by createdAt desc.
- Return JSON: { intent, table, filter, select, orderBy, take }`,
        },
        {
          role: "user",
          content: `Translate this admin query: "${transcription}"`,
        },
      ],
      { maxTokens: 512 }
    );

    let results: unknown[] = [];
    let count = 0;

    if (READ_ONLY_TABLES.includes(queryPlan.table)) {
      const prismaClient = prisma as unknown as Record<string, { findMany: (args: Record<string, unknown>) => Promise<unknown[]> }>;
      const prismaModel = prismaClient[queryPlan.table];

      if (prismaModel?.findMany) {
        const queryArgs: Record<string, unknown> = {
          take: queryPlan.take ?? 20,
          orderBy: queryPlan.orderBy
            ? { [queryPlan.orderBy]: "desc" }
            : { createdAt: "desc" },
        };

        if (queryPlan.filter && Object.keys(queryPlan.filter).length > 0) {
          queryArgs.where = queryPlan.filter;
        }

        if (queryPlan.select && queryPlan.select.length > 0) {
          const selectObj: Record<string, boolean> = {};
          for (const field of queryPlan.select) {
            selectObj[field] = true;
          }
          queryArgs.select = selectObj;
        }

        results = await prismaModel.findMany(queryArgs);
        count = results.length;
      }
    }

    const latencyMs = Date.now() - start;

    await prisma.aiQueryLog.create({
      data: {
        userId: session.id,
        query: transcription,
        sqlGenerated: JSON.stringify(queryPlan),
        result: JSON.parse(JSON.stringify(results)),
        latencyMs,
      },
    });

    return NextResponse.json({ transcription, results, count });
  } catch (error) {
    console.error("Voice query error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
