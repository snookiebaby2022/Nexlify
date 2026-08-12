import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function panelApiSecret(): string | null {
  return (
    process.env.PANEL_API_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    null
  );
}

function normalizePanelUrl(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

type UnlockResult = {
  url: string;
  ok: boolean;
  unlocked?: number;
  total?: number;
  error?: string;
};

/**
 * POST /api/admin/remote-unlock-ip
 * Unlock IPs on one or more customer panels.
 * Body: { panelUrls: string[], lineIds?: string[], usernames?: string[], unlockAll?: boolean }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const secret = panelApiSecret();
  console.log("[remote-unlock-ip] secret available:", secret ? "YES" : "NO");
  if (!secret) {
    return NextResponse.json({ error: "PANEL_API_SECRET not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { panelUrls, lineIds, usernames, unlockAll, email } = body as {
    panelUrls: string[];
    lineIds?: string[];
    usernames?: string[];
    unlockAll?: boolean;
    email?: string;
  };

  if (!Array.isArray(panelUrls) || panelUrls.length === 0) {
    return NextResponse.json({ error: "panelUrls required" }, { status: 400 });
  }

  if (!unlockAll && !Array.isArray(lineIds) && !Array.isArray(usernames)) {
    return NextResponse.json(
      { error: "Provide lineIds, usernames, or unlockAll" },
      { status: 400 }
    );
  }

  const results: UnlockResult[] = [];

  for (const rawUrl of panelUrls) {
    const url = normalizePanelUrl(rawUrl);
    if (!url) {
      results.push({ url: rawUrl, ok: false, error: "Invalid URL — must be a valid http:// or https:// address" });
      continue;
    }
    try {
      console.log("[remote-unlock-ip] calling panel:", url, "unlockAll:", unlockAll);
      const res = await fetch(`${url}/api/admin/remote-unlock-ip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-panel-api-key": secret,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({ lineIds, usernames, unlockAll, email }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        results.push({ url, ok: false, error: `Panel HTTP ${res.status}` });
        continue;
      }

      const data = await res.json();
      console.log("[remote-unlock-ip] panel response:", res.status, JSON.stringify(data).slice(0, 200));
      results.push({
        url,
        ok: res.ok && data.ok === true,
        unlocked: data.unlocked,
        total: data.total,
        error: !res.ok || !data.ok ? data.error ?? `Panel HTTP ${res.status}` : undefined,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Network error";
      results.push({ url, ok: false, error: message });
    }
  }

  await logAudit({
    email: user.email,
    action: "remote_unlock_ip",
    detail: `${results.length} panels`,
  });

  return NextResponse.json({ results });
}
