import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { secret } = body;

  // Get all unique panel URLs from licenses
  const licenses = await prisma.license.findMany({
    where: { panelUrl: { not: null } },
    select: { panelUrl: true },
    distinct: ["panelUrl"],
  });

  const panelUrls = licenses
    .map((l) => l.panelUrl)
    .filter((u): u is string => Boolean(u))
    .map((u) => u.replace(/\/$/, ""));

  if (!panelUrls.length) {
    return NextResponse.json({ error: "No panels with panelUrl found" }, { status: 404 });
  }

  const results: { url: string; ok: boolean; message?: string }[] = [];

  for (const url of panelUrls) {
    const target = `${url}/api/admin/remote-update`;
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-panel-api-key": secret || "",
        },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      results.push({
        url,
        ok: res.ok && data.ok !== false,
        message: data.error || data.message || (res.ok ? "Triggered" : `HTTP ${res.status}`),
      });
    } catch (e: any) {
      results.push({ url, ok: false, message: e.message || "Connection failed" });
    }
  }

  await logAudit({
    email: user.email,
    action: "remote_update_broadcast",
    detail: `${results.length} panels`,
  });

  return NextResponse.json({ results });
}
