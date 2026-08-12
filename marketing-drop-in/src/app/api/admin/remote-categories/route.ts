import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type IncomingCategory = {
  name: string;
  categoryType?: string;
  isAdult?: boolean;
  sortOrder?: number;
  parentId?: string | null;
};

function panelApiSecret(): string | null {
  return (
    process.env.PANEL_API_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    null
  );
}

function normalizePanelUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

async function pushCategoriesToPanel(
  panelUrl: string,
  categories: IncomingCategory[],
  secret: string,
  deleteMissing: boolean
): Promise<{ ok: boolean; created?: number; updated?: number; unchanged?: number; error?: string }> {
  try {
    const res = await fetch(`${panelUrl}/api/admin/remote-categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-panel-api-key": secret,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ categories, deleteMissing }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, error: `Panel HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Panel HTTP ${res.status}` };
    }

    return {
      ok: true,
      created: data.created,
      updated: data.updated,
      unchanged: data.unchanged,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: message };
  }
}

/**
 * POST /api/admin/remote-categories
 * Push categories to one or more panels.
 * Body: { panelUrls: string[], categories: IncomingCategory[], deleteMissing?: boolean }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const secret = panelApiSecret();
  if (!secret) {
    return NextResponse.json({ error: "PANEL_API_SECRET not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { panelUrls, categories, deleteMissing } = body as {
    panelUrls: string[];
    categories: IncomingCategory[];
    deleteMissing?: boolean;
  };

  if (!Array.isArray(panelUrls) || panelUrls.length === 0) {
    return NextResponse.json({ error: "panelUrls required" }, { status: 400 });
  }

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: "categories array required" }, { status: 400 });
  }

  const results: {
    url: string;
    ok: boolean;
    created?: number;
    updated?: number;
    unchanged?: number;
    error?: string;
  }[] = [];

  for (const rawUrl of panelUrls) {
    const url = normalizePanelUrl(rawUrl);
    const result = await pushCategoriesToPanel(url, categories, secret, deleteMissing === true);
    results.push({ url, ...result });
  }

  await logAudit({
    email: user.email,
    action: "remote_categories_push",
    detail: `${results.length} panels, ${categories.length} categories`,
  });

  return NextResponse.json({ results });
}
