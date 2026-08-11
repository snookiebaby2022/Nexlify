import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

/**
 * POST /api/admin/remote-categories/broadcast
 * Push categories to ALL panels that have a panelUrl saved.
 * Body: { categories: IncomingCategory[], deleteMissing?: boolean }
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
  const { categories, deleteMissing } = body as {
    categories: IncomingCategory[];
    deleteMissing?: boolean;
  };

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: "categories array required" }, { status: 400 });
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

  const results: {
    url: string;
    ok: boolean;
    created?: number;
    updated?: number;
    unchanged?: number;
    error?: string;
  }[] = [];

  for (const url of panelUrls) {
    try {
      const res = await fetch(`${url}/api/admin/remote-categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-panel-api-key": secret,
        },
        body: JSON.stringify({ categories, deleteMissing: deleteMissing === true }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        results.push({ url, ok: false, error: `Panel HTTP ${res.status}` });
        continue;
      }

      const data = await res.json();
      results.push({
        url,
        ok: res.ok && data.ok === true,
        created: data.created,
        updated: data.updated,
        unchanged: data.unchanged,
        error: !res.ok || !data.ok ? data.error ?? `Panel HTTP ${res.status}` : undefined,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Network error";
      results.push({ url, ok: false, error: message });
    }
  }

  await logAudit({
    email: user.email,
    action: "remote_categories_broadcast",
    detail: `${results.length} panels, ${categories.length} categories`,
  });

  return NextResponse.json({ results });
}
