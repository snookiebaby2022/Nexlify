import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { aiChatJSON, aiTranscribe, isAiConfigured } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import {
  AI_PRISMA_MODELS,
  forcedAiTake,
  redactAiRow,
  resolveAiPrismaModel,
  sanitizeAiSelect,
  sanitizeAiWhere,
} from "@/lib/ai-prisma-plan";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isAiConfigured()) {
      return NextResponse.json(
        { error: "AI features require OPENAI_API_KEY. Add it to your .env file and restart the panel." },
        { status: 503 }
      );
    }

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

Available tables: ${AI_PRISMA_MODELS.join(", ")}

Rules:
- Only use SELECT/read operations. Never generate mutations.
- Never select password, passwordHash, passwordPlain, totpSecret, apiKey, or accessCode.
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

    const modelName = resolveAiPrismaModel(queryPlan.table);
    if (modelName) {
      const prismaClient = prisma as unknown as Record<
        string,
        { findMany: (args: Record<string, unknown>) => Promise<unknown[]> }
      >;
      const prismaModel = prismaClient[modelName];

      if (prismaModel?.findMany) {
        const selectFromList =
          queryPlan.select && queryPlan.select.length > 0
            ? Object.fromEntries(queryPlan.select.map((field) => [field, true]))
            : undefined;
        const queryArgs: Record<string, unknown> = {
          take: forcedAiTake(queryPlan.take, 20),
          where: sanitizeAiWhere(queryPlan.filter),
          orderBy: queryPlan.orderBy
            ? { [queryPlan.orderBy]: "desc" }
            : { createdAt: "desc" },
        };
        const select = sanitizeAiSelect(selectFromList, modelName);
        if (select) queryArgs.select = select;
        else if (modelName === "panelUser") {
          queryArgs.omit = {
            passwordHash: true,
            passwordPlain: true,
            totpSecret: true,
            apiKey: true,
            accessCode: true,
          };
        } else if (modelName === "line") {
          queryArgs.omit = { password: true };
        }

        results = await prismaModel.findMany(queryArgs);
        results = redactAiRow(results) as unknown[];
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
