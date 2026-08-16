import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { canManageSubUsers } from "@/lib/reseller-sub-users";
import { ensureStandardUserGroups } from "@/lib/ensure-user-groups";

/** Read-only group list for reseller mass setGroup / create sub-user. */
export async function GET() {
  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session || !canManageSubUsers(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let groups = await prisma.userGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isReseller: true },
  });
  if (groups.length < 2) {
    await ensureStandardUserGroups(prisma);
    groups = await prisma.userGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isReseller: true },
    });
  }

  // Prefer reseller/sub-reseller oriented groups; still return all if filter empty
  const preferred = groups.filter(
    (g) =>
      g.isReseller ||
      /sub-?reseller|reseller/i.test(g.name)
  );
  return NextResponse.json({
    groups: (preferred.length ? preferred : groups).map((g) => ({
      id: g.id,
      name: g.name,
    })),
  });
}
