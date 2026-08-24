import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeGroupConfig } from "@/lib/group-config";
import { inferPackageDaysFromName, packageDurationSortKey } from "@/lib/package-days";
import { PanelRole } from "@prisma/client";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

function filterPackagesForSession(
  packages: Awaited<ReturnType<typeof prisma.package.findMany>>,
  session: { id: string; role: PanelRole },
  groupPackageIds: string[]
) {
  let out = packages;
  if (session.role === PanelRole.RESELLER) {
    out = out.filter((p) => p.allowResellers !== false);
  } else if (session.role === PanelRole.SUB_RESELLER) {
    out = out.filter((p) => p.allowSubResellers !== false);
  }
  if (
    (session.role === PanelRole.RESELLER || session.role === PanelRole.SUB_RESELLER) &&
    groupPackageIds.length
  ) {
    const allowed = new Set(groupPackageIds);
    out = out.filter((p) => allowed.has(p.id));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const manage = req.nextUrl.searchParams.get("manage") === "1";
  const where =
    session.role === PanelRole.ADMIN && manage ? {} : { isActive: true };

  let packages = await prisma.package.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { days: "asc" }, { name: "asc" }],
  });

  if (session.role !== PanelRole.ADMIN || !manage) {
    let groupPackageIds: string[] = [];
    if (session.role === PanelRole.RESELLER || session.role === PanelRole.SUB_RESELLER) {
      const user = await prisma.panelUser.findUnique({
        where: { id: session.id },
        include: { group: true },
      });
      groupPackageIds = mergeGroupConfig(user?.group?.config).packageIds;
    }
    packages = filterPackagesForSession(packages, session, groupPackageIds);
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
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const pkg = await prisma.package.create({
      data: {
        name: String(body.name ?? "").trim(),
        description: body.description ? String(body.description) : null,
        creditCost: Number(body.creditCost ?? 0),
        maxLines: Number(body.maxLines ?? 1),
        extraDeviceSlots: Number(body.extraDeviceSlots ?? 0),
        days: Number(body.days ?? 30),
        bouquetIds: body.bouquetIds ?? [],
        sortOrder: Number(body.sortOrder ?? 0),
        allowResellers: body.allowResellers !== false,
        allowSubResellers: body.allowSubResellers !== false,
      },
    });
    return NextResponse.json({ package: pkg });
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
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.name != null) data.name = String(body.name).trim();
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description) : null;
    }
    if (body.creditCost != null) data.creditCost = Number(body.creditCost);
    if (body.maxLines != null) data.maxLines = Number(body.maxLines);
    if (body.extraDeviceSlots != null) data.extraDeviceSlots = Number(body.extraDeviceSlots);
    if (body.days != null) data.days = Number(body.days);
    if (body.bouquetIds != null) data.bouquetIds = body.bouquetIds;
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder);
    if (body.isActive != null) data.isActive = Boolean(body.isActive);
    if (body.allowResellers != null) data.allowResellers = Boolean(body.allowResellers);
    if (body.allowSubResellers != null) data.allowSubResellers = Boolean(body.allowSubResellers);

    const pkg = await prisma.package.update({ where: { id }, data });
    return NextResponse.json({ package: pkg });
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
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.package.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
