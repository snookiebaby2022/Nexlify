import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const builds = await prisma.appBuild.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ builds });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { appName, packageName, logoUrl, primaryColor, serverUrl } = body;

  if (!appName || !packageName) {
    return NextResponse.json({ error: "App name and package name are required" }, { status: 400 });
  }

  const build = await prisma.appBuild.create({
    data: {
      appName: String(appName),
      packageName: String(packageName),
      logoUrl: logoUrl ? String(logoUrl) : null,
      primaryColor: primaryColor ? String(primaryColor) : "#00c0ef",
      serverUrl: serverUrl ? String(serverUrl) : null,
      status: "QUEUED",
      createdBy: session.id,
    },
  });

  return NextResponse.json({
    build,
    message: "APK build queued. It will be processed by the build pipeline.",
  });
}

export async function PATCH(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, status, downloadUrl } = body;

  if (!id) return NextResponse.json({ error: "Missing build id" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (downloadUrl !== undefined) update.downloadUrl = downloadUrl;
  if (status === "COMPLETED" || status === "FAILED") update.completedAt = new Date();

  const build = await prisma.appBuild.update({
    where: { id: String(id) },
    data: update,
  });

  return NextResponse.json({ build });
}

export async function DELETE(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.appBuild.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
