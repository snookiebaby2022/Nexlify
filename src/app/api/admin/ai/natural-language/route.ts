import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiChatJSON } from "@/lib/ai";
import { PanelRole } from "@prisma/client";

const ALLOWED_MODELS = [
  "stream",
  "line",
  "category",
  "bouquet",
  "liveConnection",
  "epgSource",
  "epgProgram",
  "connectionGeography",
  "panelUser",
  "streamServer",
  "streamHealthCheck",
] as const;

type AllowedModel = (typeof ALLOWED_MODELS)[number];

interface AiQueryPlan {
  model: AllowedModel;
  operation: "findMany" | "count" | "aggregate";
  where?: Record<string, unknown>;
  select?: Record<string, boolean>;
  orderBy?: Record<string, string>;
  take?: number;
  skip?: number;
  groupBy?: string[];
  _count?: boolean;
  _sum?: Record<string, boolean>;
  _avg?: Record<string, boolean>;
}

async function executeQuery(plan: AiQueryPlan): Promise<{ results: unknown; count: number }> {
  const model = (prisma as unknown as Record<string, unknown>)[plan.model] as {
    findMany: (args: unknown) => Promise<unknown[]>;
    count: (args: unknown) => Promise<number>;
    aggregate: (args: unknown) => Promise<unknown>;
  };

  if (!model) {
    throw new Error(`Model '${plan.model}' is not available`);
  }

  if (plan.operation === "count") {
    const count = await model.count({ where: plan.where ?? {} });
    return { results: count, count };
  }

  if (plan.operation === "aggregate") {
    const aggArgs: Record<string, unknown> = { where: plan.where ?? {} };
    if (plan._sum) aggArgs._sum = plan._sum;
    if (plan._avg) aggArgs._avg = plan._avg;
    if (plan._count) aggArgs._count = true;
    if (plan.groupBy) {
      const grouped = await (prisma as unknown as Record<string, unknown>)[plan.model] as {
        groupBy: (args: unknown) => Promise<unknown[]>;
      };
      const results = await grouped.groupBy({
        by: plan.groupBy,
        where: plan.where ?? {},
        _count: true,
        ...(plan._sum ? { _sum: plan._sum } : {}),
      });
      return { results, count: Array.isArray(results) ? results.length : 0 };
    }
    const result = await model.aggregate(aggArgs);
    return { results: result, count: 1 };
  }

  const findArgs: Record<string, unknown> = {
    where: plan.where ?? {},
  };
  if (plan.select) findArgs.select = plan.select;
  if (plan.orderBy) findArgs.orderBy = plan.orderBy;
  if (plan.take) findArgs.take = Math.min(plan.take, 100);
  if (plan.skip) findArgs.skip = plan.skip;

  const results = await model.findMany(findArgs);
  return { results, count: results.length };
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const start = Date.now();

  try {
    const body = await req.json();
    const query = String(body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    let plan: AiQueryPlan;
    try {
      plan = await aiChatJSON<AiQueryPlan>(
        [
          {
            role: "system",
            content: `You are a Prisma query planner for an IPTV panel. Convert natural language to a safe read-only Prisma query plan. Available models: ${ALLOWED_MODELS.join(", ")}. Allowed operations: findMany, count, aggregate. NEVER generate create, update, delete, or upsert operations. Return JSON only with the structure: { model, operation, where?, select?, orderBy?, take?, skip?, groupBy?, _count?, _sum?, _avg? }. Keep where clauses simple using contains, equals, gt, gte, lt, lte, in, startsWith. Always set take to a reasonable limit (default 50, max 100).`,
          },
          {
            role: "user",
            content: query,
          },
        ],
        { maxTokens: 1024 }
      );
    } catch {
      return NextResponse.json(
        { error: "AI failed to parse query" },
        { status: 500 }
      );
    }

    if (!ALLOWED_MODELS.includes(plan.model)) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    if (!["findMany", "count", "aggregate"].includes(plan.operation)) {
      return NextResponse.json({ error: "Only read operations are allowed" }, { status: 400 });
    }

    if (plan.take) plan.take = Math.min(plan.take, 100);

    const { results, count } = await executeQuery(plan);

    const latencyMs = Date.now() - start;

    await prisma.aiQueryLog.create({
      data: {
        userId: session.id,
        query,
        sqlGenerated: JSON.stringify(plan),
        result: results as never,
        latencyMs,
      },
    });

    return NextResponse.json({ query, sqlDescription: plan, results, count });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Natural language query error:", message);
    return NextResponse.json({ error: "Failed to process query" }, { status: 500 });
  }
}
