import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { canManageSubUsers } from "@/lib/reseller-sub-users";
import { ensureStandardUserGroups } from "@/lib/ensure-user-groups";
import { mergeGroupConfig } from "@/lib/group-config";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

function isSubResellerGroupName(name: string): boolean {
  return /sub-?reseller/i.test(name.trim());
}

/** Read-only group list for reseller mass setGroup / create sub-reseller. */
export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.RESELLER, PanelRole.SUB_RESELLER]);
  if (!session || !canManageSubUsers(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roleFilter = req.nextUrl.searchParams.get("role");

  let groups = await prisma.userGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isReseller: true, config: true },
  });
  if (groups.length < 3) {
    await ensureStandardUserGroups(prisma);
    groups = await prisma.userGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isReseller: true, config: true },
    });
  }

  const enriched = groups.map((g) => {
    const cfg = mergeGroupConfig(g.config);
    const groupRole =
      cfg.groupRole ??
      (g.isReseller && isSubResellerGroupName(g.name) ? "sub_reseller" : g.isReseller ? "reseller" : "admin");
    return { id: g.id, name: g.name, groupRole };
  });

  if (roleFilter === "sub_reseller") {
    const subGroups = enriched.filter(
      (g) => g.groupRole === "sub_reseller" || isSubResellerGroupName(g.name)
    );
    return NextResponse.json({
      groups: (subGroups.length ? subGroups : enriched.filter((g) => g.groupRole !== "admin")).map(
        ({ id, name, groupRole }) => ({ id, name, groupRole })
      ),
    });
  }

  // Reseller portal: sub-reseller accounts use sub-reseller groups; exclude admin groups.
  const preferred = enriched.filter(
    (g) =>
      g.groupRole === "sub_reseller" ||
      g.groupRole === "reseller" ||
      /sub-?reseller|reseller/i.test(g.name)
  );
  const list = (preferred.length ? preferred : enriched.filter((g) => g.groupRole !== "admin")).map(
    ({ id, name, groupRole }) => ({ id, name, groupRole })
  );
  return NextResponse.json({ groups: list });
}
