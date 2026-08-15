import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole, Prisma } from "@prisma/client";

function asConfig(body: Record<string, unknown>) {
  return {
    theme: body.theme ? String(body.theme) : "dark",
    welcomeText: body.welcomeText ? String(body.welcomeText).slice(0, 500) : "",
    loginBgUrl: body.loginBgUrl ? String(body.loginBgUrl) : "",
    contactEmail: body.contactEmail ? String(body.contactEmail) : "",
    supportUrl: body.supportUrl ? String(body.supportUrl) : "",
    telegram: body.telegram ? String(body.telegram) : "",
    whatsapp: body.whatsapp ? String(body.whatsapp) : "",
    website: body.website ? String(body.website) : "",
    playerType: body.playerType ? String(body.playerType) : "exo",
    allowCast: body.allowCast !== false,
    allowPip: body.allowPip !== false,
    showEpg: body.showEpg !== false,
    showCatchup: body.showCatchup === true,
    adultPinRequired: body.adultPinRequired === true,
    forceUpdate: body.forceUpdate === true,
    versionName: body.versionName ? String(body.versionName) : "1.0.0",
    versionCode: Number(body.versionCode) || 1,
    minAndroidSdk: Number(body.minAndroidSdk) || 24,
    platforms: Array.isArray(body.platforms)
      ? body.platforms.map(String)
      : ["android"],
    dnsHosts: Array.isArray(body.dnsHosts)
      ? body.dnsHosts.map(String).filter(Boolean)
      : String(body.dnsHostsText || "")
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
    xtreamPath: body.xtreamPath ? String(body.xtreamPath) : "/player_api.php",
    hideServerUrl: body.hideServerUrl === true,
    bundleIdIos: body.bundleIdIos ? String(body.bundleIdIos) : "",
    notes: body.notes ? String(body.notes).slice(0, 2000) : "",
  };
}

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const builds = await prisma.appBuild.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return NextResponse.json({ builds });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const appName = String(body.appName ?? "").trim();
  const packageName = String(body.packageName ?? "").trim();

  if (!appName || !packageName) {
    return NextResponse.json({ error: "App name and package name are required" }, { status: 400 });
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageName)) {
    return NextResponse.json(
      { error: "Package name must look like com.company.app" },
      { status: 400 }
    );
  }

  const config = asConfig(body);
  const dns = config.dnsHosts;
  const serverUrl =
    String(body.serverUrl ?? "").trim() ||
    (dns.length ? dns[0] : "") ||
    null;

  const build = await prisma.appBuild.create({
    data: {
      appName,
      packageName,
      logoUrl: body.logoUrl ? String(body.logoUrl) : null,
      splashUrl: body.splashUrl ? String(body.splashUrl) : null,
      primaryColor: body.primaryColor ? String(body.primaryColor) : "#00c0ef",
      secondaryColor: body.secondaryColor ? String(body.secondaryColor) : "#0f172a",
      accentColor: body.accentColor ? String(body.accentColor) : "#22c55e",
      serverUrl,
      config: config as Prisma.InputJsonValue,
      status: "QUEUED",
      createdBy: session.id,
    },
  });

  return NextResponse.json({
    build,
    message: "Branded app build queued with full config. Processed when the build pipeline is connected.",
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
