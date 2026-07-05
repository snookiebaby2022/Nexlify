import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { createMobileApp, getMobileApps, deleteMobileApp } from "@/lib/mobile-app-builder";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apps = await getMobileApps();
  return NextResponse.json({ apps });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, name, packageName, resellerId, appId } = await req.json();

  if (action === "create") {
    const app = await createMobileApp(name, packageName, resellerId);
    return NextResponse.json(app);
  }

  if (action === "delete") {
    await deleteMobileApp(appId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
