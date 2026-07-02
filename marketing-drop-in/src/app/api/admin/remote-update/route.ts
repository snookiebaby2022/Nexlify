import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
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
  const { panelUrls, secret } = body;

  if (!Array.isArray(panelUrls) || panelUrls.length === 0) {
    return NextResponse.json({ error: "panelUrls required" }, { status: 400 });
  }

  const results: { url: string; ok: boolean; message?: string }[] = [];

  for (const rawUrl of panelUrls) {
    const url = String(rawUrl).replace(/\/$/, "");
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
    action: "remote_update_trigger",
    detail: `${results.length} panels`,
  });

  return NextResponse.json({ results });
}
