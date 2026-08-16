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

  // Immediately produce a downloadable branded config package (APK binary still needs external builder).
  try {
    const { writeFile, mkdir } = await import("fs/promises");
    const { join } = await import("path");
    const dir = join(process.cwd(), "public", "app-builds");
    await mkdir(dir, { recursive: true });
    const fileName = `${build.id}.json`;
    const payload = {
      format: "nexlify-app-config/v1",
      generatedAt: new Date().toISOString(),
      appName,
      packageName,
      logoUrl: build.logoUrl,
      splashUrl: build.splashUrl,
      primaryColor: build.primaryColor,
      secondaryColor: build.secondaryColor,
      accentColor: build.accentColor,
      serverUrl,
      config,
      note: "Import this config into your branded APK/IPA builder or CI. This file is not an APK/IPA.",
      howToUse: [
        "1. Download this JSON from the panel App Builder history.",
        "2. Pass it to your Android/iOS branded build pipeline (Gradle/Xcode/CI) with signing keys.",
        "3. When the binary is published, PATCH /api/admin/app-builder with { id, status: \"COMPLETED\", downloadUrl } so the panel Download button points at the APK/IPA.",
      ],
      buildId: build.id,
    };
    await writeFile(join(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
    const readme = [
      "Nexlify branded app config",
      "==========================",
      "",
      `Build ID: ${build.id}`,
      `App: ${appName}`,
      `Package: ${packageName}`,
      "",
      "This package is configuration only (nexlify-app-config/v1).",
      "Native APK/IPA still needs an external builder with signing keys.",
      "",
      "After your CI produces a binary, update the panel build:",
      '  PATCH /api/admin/app-builder',
      `  { "id": "${build.id}", "status": "COMPLETED", "downloadUrl": "https://cdn.example.com/app.apk" }`,
      "",
    ].join("\n");
    await writeFile(join(dir, `${build.id}.README.txt`), readme, "utf8");
    const downloadUrl = `/app-builds/${fileName}`;
    const completed = await prisma.appBuild.update({
      where: { id: build.id },
      data: {
        status: "COMPLETED",
        downloadUrl,
        completedAt: new Date(),
      },
    });
    return NextResponse.json({
      build: completed,
      readmeUrl: `/app-builds/${build.id}.README.txt`,
      message:
        "Config package ready. Native APK/IPA still requires an external builder — use the README next to this JSON.",
    });
  } catch {
    return NextResponse.json({
      build,
      message: "Build queued; config package write failed — retry or use external pipeline.",
    });
  }
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
