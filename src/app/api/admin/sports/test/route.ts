import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { testSportsProvider } from "@/lib/live-sports";
import type { LiveSportsProvider } from "@/lib/live-sports-types";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const provider = body.provider as LiveSportsProvider;
  if (!provider?.fixturesUrl) {
    return NextResponse.json({ error: "Provider required" }, { status: 400 });
  }

  const result = await testSportsProvider(provider);
  return NextResponse.json(result);
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
