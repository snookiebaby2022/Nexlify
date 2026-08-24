import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiChatJSON, isAiConfigured } from "@/lib/ai";
import { parseJsonBody } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import {
  AI_PRISMA_MODELS,
  type AiPrismaModel,
  forcedAiTake,
  redactAiRow,
  resolveAiPrismaModel,
  sanitizeAiSelect,
  sanitizeAiWhere,
} from "@/lib/ai-prisma-plan";

interface AiQueryPlan {
  model: AiPrismaModel;
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

  const where = sanitizeAiWhere(plan.where);

  if (plan.operation === "count") {
    const count = await model.count({ where });
    return { results: count, count };
  }

  if (plan.operation === "aggregate") {
    const aggArgs: Record<string, unknown> = { where };
    if (plan._sum) aggArgs._sum = plan._sum;
    if (plan._avg) aggArgs._avg = plan._avg;
    if (plan._count) aggArgs._count = true;
    if (plan.groupBy) {
      const grouped = (prisma as unknown as Record<string, unknown>)[plan.model] as {
        groupBy: (args: unknown) => Promise<unknown[]>;
      };
      const results = await grouped.groupBy({
        by: plan.groupBy,
        where,
        _count: true,
        ...(plan._sum ? { _sum: plan._sum } : {}),
      });
      return { results: redactAiRow(results), count: Array.isArray(results) ? results.length : 0 };
    }
    const result = await model.aggregate(aggArgs);
    return { results: redactAiRow(result), count: 1 };
  }

  const take = forcedAiTake(plan.take, 50);
  const findArgs: Record<string, unknown> = { where, take };
  const select = sanitizeAiSelect(plan.select, plan.model);
  if (select) {
    findArgs.select = select;
  } else if (plan.model === "panelUser") {
    findArgs.omit = {
      passwordHash: true,
      passwordPlain: true,
      totpSecret: true,
      apiKey: true,
      accessCode: true,
    };
  } else if (plan.model === "line") {
    findArgs.omit = { password: true };
  }
  if (plan.orderBy) findArgs.orderBy = plan.orderBy;
  if (plan.skip) findArgs.skip = Math.max(0, Math.min(Number(plan.skip) || 0, 10_000));

  const results = await model.findMany(findArgs);
  return { results: redactAiRow(results), count: results.length };
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI features require OPENAI_API_KEY. Add it to your .env file and restart the panel." },
      { status: 503 }
    );
  }

  const start = Date.now();

  try {
    const parsed = await parseJsonBody<{ query?: unknown }>(req);
    if (!parsed.ok) return parsed.response;
    const query = String(parsed.data.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    let plan: AiQueryPlan;
    try {
      plan = await aiChatJSON<AiQueryPlan>(
        [
          {
            role: "system",
            content: `You are a Prisma query planner for an IPTV panel. Convert natural language to a safe read-only Prisma query plan. Available models: ${AI_PRISMA_MODELS.join(", ")}. Allowed operations: findMany, count, aggregate. NEVER generate create, update, delete, or upsert operations. Never select password, passwordHash, passwordPlain, totpSecret, apiKey, or accessCode. Return JSON only with the structure: { model, operation, where?, select?, orderBy?, take?, skip?, groupBy?, _count?, _sum?, _avg? }. Keep where clauses simple using contains, equals, gt, gte, lt, lte, in, startsWith. Always set take (default 50, max 50).`,
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

    const model = resolveAiPrismaModel(plan.model);
    if (!model) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    plan.model = model;
    if (!["findMany", "count", "aggregate"].includes(plan.operation)) {
      return NextResponse.json({ error: "Only read operations are allowed" }, { status: 400 });
    }

    plan.take = forcedAiTake(plan.take, 50);
    plan.where = sanitizeAiWhere(plan.where);
    plan.select = sanitizeAiSelect(plan.select, plan.model) as Record<string, boolean> | undefined;

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
