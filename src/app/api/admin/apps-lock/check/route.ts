import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lineId = searchParams.get("lineId");
  const appPackage = searchParams.get("appPackage") ?? "";
  const appType = searchParams.get("appType") ?? "";

  if (!lineId) {
    return NextResponse.json({ error: "lineId required" }, { status: 400 });
  }

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: { appsLocks: { include: { policy: true } } },
  });

  if (!line) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  for (const lock of line.appsLocks) {
    const policy = lock.policy;
    if (!policy || !policy.isActive) continue;

    const pkg = appPackage.trim();
    const type = appType.trim();

    if (policy.allowedApps.length > 0 && pkg && !policy.allowedApps.includes(pkg)) {
      return NextResponse.json({ allowed: false, reason: "App not allowed by policy" });
    }
    if (pkg && policy.blockedApps.includes(pkg)) {
      return NextResponse.json({ allowed: false, reason: "App blocked by policy" });
    }
    if (policy.allowedAppTypes.length > 0 && type && !policy.allowedAppTypes.includes(type)) {
      return NextResponse.json({ allowed: false, reason: "Device type not allowed by policy" });
    }
  }

  return NextResponse.json({ allowed: true });
}
