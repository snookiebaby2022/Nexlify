import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

function panelApiSecret(override?: unknown): string {
  const fromBody = typeof override === "string" ? override.trim() : "";
  if (fromBody) return fromBody;
  return (
    process.env.PANEL_API_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    ""
  );
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { secret, force } = body as { secret?: string; force?: boolean };

  const apiKey = panelApiSecret(secret);
  if (!apiKey) {
    return NextResponse.json(
      { error: "PANEL_API_SECRET not configured (pass secret or set env)" },
      { status: 400 }
    );
  }

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

  const results: { url: string; ok: boolean; message?: string; started?: boolean; reason?: string }[] =
    [];

  for (const url of panelUrls) {
    const target = `${url}/api/admin/remote-update`;
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-panel-api-key": apiKey,
          "User-Agent": BROWSER_UA,
        },
        body: JSON.stringify({ force: force === true }),
        signal: AbortSignal.timeout(20000),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const started = data.started === true;
      const reason = typeof data.reason === "string" ? data.reason : undefined;
      results.push({
        url,
        ok: res.ok && data.ok !== false,
        started,
        reason,
        message:
          (typeof data.error === "string" && data.error) ||
          (typeof data.message === "string" && data.message) ||
          (res.ok ? (started ? "Triggered" : reason || "OK") : `HTTP ${res.status}`),
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
