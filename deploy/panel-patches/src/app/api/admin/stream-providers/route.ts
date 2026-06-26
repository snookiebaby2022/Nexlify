import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { probeStreamProvider, validateProviderInput } from "@/lib/stream-provider-probe";
import { PanelRole, Prisma } from "@prisma/client";

function prismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return { status: 404, error: "Provider not found" };
    if (e.code === "P2002") return { status: 409, error: "A provider with this name or URL already exists" };
  }
  console.error("[stream-providers]", e);
  return { status: 500, error: "Database error — try again" };
}

export async function GET(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const vodOnly = req.nextUrl.searchParams.get("vod") === "1";

  try {
    const providers = await prisma.streamProvider.findMany({ orderBy: { name: "asc" } });
    const filtered = vodOnly
      ? providers.filter((p) => {
          const t = (p.providerType ?? "").toLowerCase();
          return t === "generic_url" || t === "file_host" || t === "xtream_vod" || !t;
        })
      : providers;
    return NextResponse.json({ providers: filtered, readOnly: session.role !== PanelRole.ADMIN });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.check && body.id) {
    const id = String(body.id);
    try {
      const p = await prisma.streamProvider.findUnique({ where: { id } });
      if (!p) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

      const probe = await probeStreamProvider(p.baseUrl);
      const updated = await prisma.streamProvider.update({
        where: { id: p.id },
        data: {
          status: probe.status,
          statusMessage: probe.message,
          lastCheckAt: new Date(),
        },
      });
      return NextResponse.json({ provider: updated, probe });
    } catch (e) {
      const err = prismaError(e);
      return NextResponse.json({ error: err.error }, { status: err.status });
    }
  }

  const validated = validateProviderInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, field: validated.field }, { status: 400 });
  }

  try {
    const probe = await probeStreamProvider(validated.data.baseUrl);
    const provider = await prisma.streamProvider.create({
      data: {
        name: validated.data.name,
        baseUrl: validated.data.baseUrl,
        apiKey: body.apiKey ? String(body.apiKey) : null,
        providerType: body.providerType ? String(body.providerType) : null,
        description: body.description ? String(body.description) : null,
        contactEmail: validated.data.contactEmail,
        region: body.region ? String(body.region) : null,
        maxStreams: validated.data.maxStreams,
        notes: body.notes ? String(body.notes) : null,
        status: probe.status,
        statusMessage: probe.message,
        lastCheckAt: new Date(),
      },
    });
    return NextResponse.json({ provider, probe });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const validated = validateProviderInput({
    name: body.name,
    baseUrl: body.baseUrl,
    maxStreams: body.maxStreams,
    contactEmail: body.contactEmail,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, field: validated.field }, { status: 400 });
  }

  try {
    const existing = await prisma.streamProvider.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    const urlChanged = validated.data.baseUrl !== existing.baseUrl;
    let status = existing.status;
    let statusMessage = existing.statusMessage;
    let lastCheckAt = existing.lastCheckAt;

    if (urlChanged || body.recheck) {
      const probe = await probeStreamProvider(validated.data.baseUrl);
      status = probe.status;
      statusMessage = probe.message;
      lastCheckAt = new Date();
    }

    const provider = await prisma.streamProvider.update({
      where: { id },
      data: {
        name: validated.data.name,
        baseUrl: validated.data.baseUrl,
        apiKey: body.apiKey === undefined ? undefined : body.apiKey ? String(body.apiKey) : null,
        isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
        providerType: body.providerType === undefined ? undefined : body.providerType ? String(body.providerType) : null,
        description: body.description === undefined ? undefined : body.description ? String(body.description) : null,
        contactEmail: validated.data.contactEmail,
        region: body.region === undefined ? undefined : body.region ? String(body.region) : null,
        maxStreams: validated.data.maxStreams,
        notes: body.notes === undefined ? undefined : body.notes ? String(body.notes) : null,
        status,
        statusMessage,
        lastCheckAt,
      },
    });
    return NextResponse.json({ provider });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await prisma.streamProvider.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = prismaError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}
