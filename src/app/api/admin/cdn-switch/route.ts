import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { probeAllCdns, selectBestCdn, getCdnMetrics } from "@/lib/smart-cdn";
import { suggestCloudflareCdnEndpoints } from "@/lib/smart-cdn-suggest";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { iptvCorsPreflight } from "@/lib/iptv-cors";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function OPTIONS() {
  return iptvCorsPreflight();
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  try {
    if (action === "best") {
      const best = await selectBestCdn();
      return NextResponse.json(best);
    }
    if (action === "probe") {
      const results = await probeAllCdns();
      return NextResponse.json(results);
    }
    if (action === "suggest-cloudflare") {
      const suggestions = await suggestCloudflareCdnEndpoints();
      return NextResponse.json({ suggestions });
    }
    const cdnId = sp.get("cdnId");
    if (cdnId) return NextResponse.json(await getCdnMetrics(cdnId));

    const endpoints = await prisma.cdnEndpoint.findMany({
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });
    const withMetrics = await Promise.all(
      endpoints.map(async (ep) => ({
        ...ep,
        metrics: await getCdnMetrics(ep.id),
      }))
    );
    return NextResponse.json({ endpoints: withMetrics });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  try {
    if (body.action === "import-cloudflare") {
      const suggestions = await suggestCloudflareCdnEndpoints();
      const created = [];
      for (const s of suggestions) {
        const ep = await prisma.cdnEndpoint.create({
          data: {
            name: s.name.slice(0, 100),
            url: s.url.slice(0, 500),
            priority: Math.max(0, Math.min(100, s.priority)),
            isActive: true,
            region: s.region.slice(0, 50),
            maxBandwidthMbps: 5000,
          },
        });
        created.push(ep);
      }
      return NextResponse.json({
        ok: true,
        created: created.length,
        endpoints: created,
        note:
          created.length === 0
            ? "No new Cloudflare hostnames found on stream servers (or they are already added)."
            : "Imported Cloudflare hostnames from stream servers. Probe to drop 521/unreachable URLs.",
      });
    }

    if (body.action === "add" || !body.action) {
      const name = String(body.name ?? "").trim().slice(0, 100);
      const url = String(body.url ?? "").trim().slice(0, 500);
      if (!name || !url) {
        return NextResponse.json({ error: "name and url are required" }, { status: 400 });
      }
      try {
        new URL(url);
      } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }
      const ep = await prisma.cdnEndpoint.create({
        data: {
          name,
          url,
          priority: Math.max(0, Math.min(100, Number(body.priority) || 0)),
          isActive: body.isActive !== false,
          region: String(body.region ?? "global").slice(0, 50),
          maxBandwidthMbps: Math.max(1, Math.min(100000, Number(body.maxBandwidthMbps) || 1000)),
        },
      });
      return NextResponse.json(ep);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 100);
  if (body.url !== undefined) {
    const url = String(body.url).trim().slice(0, 500);
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    data.url = url;
  }
  if (body.priority !== undefined) data.priority = Math.max(0, Math.min(100, Number(body.priority) || 0));
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.region !== undefined) data.region = String(body.region).slice(0, 50);
  if (body.maxBandwidthMbps !== undefined) {
    data.maxBandwidthMbps = Math.max(1, Math.min(100000, Number(body.maxBandwidthMbps) || 1000));
  }

  try {
    const ep = await prisma.cdnEndpoint.update({ where: { id }, data });
    return NextResponse.json(ep);
  } catch {
    return NextResponse.json({ error: "CDN endpoint not found" }, { status: 404 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id") || (await req.json().catch(() => ({}))).id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await prisma.cdnEndpoint.delete({ where: { id: String(id) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "CDN endpoint not found" }, { status: 404 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
