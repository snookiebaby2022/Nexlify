import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureStandardGroupPackages, syncPackageCreditPricing } from "@/lib/group-packages";
import { PanelRole } from "@prisma/client";

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const packageIds = await ensureStandardGroupPackages(prisma);
  await syncPackageCreditPricing(prisma, packageIds);

  const packages = await prisma.package.findMany({
    where: { id: { in: packageIds } },
    orderBy: [{ sortOrder: "asc" }, { days: "asc" }],
  });

  return NextResponse.json({ packageIds, packages });
}
