import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeGroupConfig } from "@/lib/group-config";
import { ensureStandardGroupPackages, syncPackageCreditPricing } from "@/lib/group-packages";
import { PanelRole, Prisma } from "@prisma/client";

function serializeGroup(g: {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  isReseller: boolean;
  isBanned: boolean;
  config: unknown;
}) {
  return {
    ...g,
    config: mergeGroupConfig(g.config),
  };
}

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const group = await prisma.userGroup.findUnique({
      where: { id },
      include: { parent: { select: { id: true, name: true } }, _count: { select: { users: true } } },
    });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ group: serializeGroup(group) });
  }

  const groups = await prisma.userGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  return NextResponse.json({ groups: groups.map(serializeGroup) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  let config = mergeGroupConfig(body.config);

  if (body.ensureStandardPackages === true) {
    const standardIds = await ensureStandardGroupPackages(prisma);
    const merged = new Set([...config.packageIds, ...standardIds]);
    config = { ...config, packageIds: [...merged] };
  }

  if (config.packageIds.length) {
    await syncPackageCreditPricing(prisma, config.packageIds);
  }

  const group = await prisma.userGroup.create({
    data: {
      name: body.name,
      description: body.description || null,
      color: body.color || "#e85d4c",
      parentId: body.parentId || null,
      sortOrder: Number(body.sortOrder ?? 0),
      isReseller: body.isReseller === true,
      isBanned: body.isBanned === true,
      config: config as Prisma.InputJsonValue,
    },
  });
  return NextResponse.json({ group: serializeGroup(group) });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let config = body.config != null ? mergeGroupConfig(body.config) : undefined;

  if (body.ensureStandardPackages === true && config) {
    const standardIds = await ensureStandardGroupPackages(prisma);
    const merged = new Set([...config.packageIds, ...standardIds]);
    config = { ...config, packageIds: [...merged] };
  }

  if (config?.packageIds.length) {
    await syncPackageCreditPricing(prisma, config.packageIds);
  }

  const group = await prisma.userGroup.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      color: body.color,
      parentId: body.parentId === undefined ? undefined : body.parentId || null,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      isReseller: body.isReseller,
      isBanned: body.isBanned,
      config: config != null ? (config as Prisma.InputJsonValue) : undefined,
    },
  });
  return NextResponse.json({ group: serializeGroup(group) });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.userGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
