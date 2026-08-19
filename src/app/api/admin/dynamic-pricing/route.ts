import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createPricingRule,
  getPricingRules,
  deletePricingRule,
  getPricingSuggestion,
} from "@/lib/dynamic-pricing";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rules = await getPricingRules();
  return NextResponse.json({ rules });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, name, basePrice, peakMultiplier, offPeakMultiplier, ruleId, streamId } =
    await req.json();

  if (action === "create") {
    const rule = await createPricingRule(name, basePrice, peakMultiplier, offPeakMultiplier);
    return NextResponse.json(rule);
  }

  if (action === "delete") {
    await deletePricingRule(ruleId);
    return NextResponse.json({ ok: true });
  }

  if (action === "suggest") {
    const suggestion = await getPricingSuggestion(streamId);
    return NextResponse.json(suggestion);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
