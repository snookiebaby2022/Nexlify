import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeGroupConfig } from "@/lib/group-config";
import { inferPackageDaysFromName, packageDurationSortKey } from "@/lib/package-days";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let packages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { days: "asc" }, { name: "asc" }],
  });

  if (session.role === PanelRole.RESELLER || session.role === PanelRole.SUB_RESELLER) {
    const user = await prisma.panelUser.findUnique({
      where: { id: session.id },
      include: { group: true },
    });
    const ids = mergeGroupConfig(user?.group?.config).packageIds;
    if (ids.length) {
      const allowed = new Set(ids);
      packages = packages.filter((p) => allowed.has(p.id));
    }
  }

  const normalized = packages
    .map((p) => {
      const days = inferPackageDaysFromName(p.name, p.days) ?? p.days;
      return { ...p, days, sortOrder: packageDurationSortKey(days, p.name) };
    })
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.days - b.days || a.name.localeCompare(b.name)
    );

  return NextResponse.json({ packages: normalized });
}

export async function POST(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const pkg = await prisma.package.create({
    data: {
      name: body.name,
      description: body.description || null,
      creditCost: Number(body.creditCost ?? 0),
      maxLines: Number(body.maxLines ?? 1),
      extraDeviceSlots: Number(body.extraDeviceSlots ?? 0),
      days: Number(body.days ?? 30),
      bouquetIds: body.bouquetIds ?? [],
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });
  return NextResponse.json({ package: pkg });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.package.delete({ where: { id } });
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
