import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
const TYPES = ["asn", "ip", "isp", "user-agent"] as const;
type BlockType = (typeof TYPES)[number];

function parseType(raw: string | null): BlockType | null {
  if (raw && (TYPES as readonly string[]).includes(raw)) return raw as BlockType;
  return null;
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = parseType(req.nextUrl.searchParams.get("type"));
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  switch (type) {
    case "asn":
      return NextResponse.json({ items: await prisma.blockedAsn.findMany({ orderBy: { createdAt: "desc" } }) });
    case "ip":
      return NextResponse.json({ items: await prisma.blockedIp.findMany({ orderBy: { createdAt: "desc" } }) });
    case "isp":
      return NextResponse.json({ items: await prisma.blockedIsp.findMany({ orderBy: { createdAt: "desc" } }) });
    case "user-agent":
      return NextResponse.json({
        items: await prisma.blockedUserAgent.findMany({ orderBy: { createdAt: "desc" } }),
      });
  }
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const type = parseType(body.type);
  if (!type) return NextResponse.json({ error: "invalid type" }, { status: 400 });

  switch (type) {
    case "asn": {
      const item = await prisma.blockedAsn.create({
        data: {
          asn: String(body.asn ?? body.value ?? "").trim(),
          label: body.label || null,
          reason: body.reason || null,
        },
      });
      return NextResponse.json({ item });
    }
    case "ip": {
      const item = await prisma.blockedIp.create({
        data: {
          value: String(body.value ?? "").trim(),
          label: body.label || null,
          reason: body.reason || null,
        },
      });
      return NextResponse.json({ item });
    }
    case "isp": {
      const item = await prisma.blockedIsp.create({
        data: {
          name: String(body.name ?? body.value ?? "").trim(),
          reason: body.reason || null,
        },
      });
      return NextResponse.json({ item });
    }
    case "user-agent": {
      const item = await prisma.blockedUserAgent.create({
        data: {
          pattern: String(body.pattern ?? body.value ?? "").trim(),
          reason: body.reason || null,
        },
      });
      return NextResponse.json({ item });
    }
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = parseType(req.nextUrl.searchParams.get("type"));
  const id = req.nextUrl.searchParams.get("id");
  if (!type || !id) return NextResponse.json({ error: "type and id required" }, { status: 400 });

  switch (type) {
    case "asn":
      await prisma.blockedAsn.delete({ where: { id } });
      break;
    case "ip":
      await prisma.blockedIp.delete({ where: { id } });
      break;
    case "isp":
      await prisma.blockedIsp.delete({ where: { id } });
      break;
    case "user-agent":
      await prisma.blockedUserAgent.delete({ where: { id } });
      break;
  }
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
