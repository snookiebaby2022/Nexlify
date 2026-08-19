import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { createMobileApp, getMobileApps, deleteMobileApp } from "@/lib/mobile-app-builder";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apps = await getMobileApps();
  return NextResponse.json({ apps });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, name, packageName, resellerId, appId } = parsed.data;

  if (action === "create") {
    const app = await createMobileApp(name, packageName, resellerId);
    return NextResponse.json(app);
  }

  if (action === "delete") {
    await deleteMobileApp(appId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
