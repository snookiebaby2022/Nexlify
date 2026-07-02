import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { testSportsProvider } from "@/lib/live-sports";
import type { LiveSportsProvider } from "@/lib/live-sports-types";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const provider = body.provider as LiveSportsProvider;
  if (!provider?.fixturesUrl) {
    return NextResponse.json({ error: "Provider required" }, { status: 400 });
  }

  const result = await testSportsProvider(provider);
  return NextResponse.json(result);
}
