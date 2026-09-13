import { PanelRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

export type LineOwnerOption = { id: string; username: string; role: string };

export function ownerRoleLabel(role?: string | null): string {
  if (!role || role === PanelRole.ADMIN) return "Admin";
  if (role === PanelRole.SUB_RESELLER) return "Sub-reseller";
  if (role === PanelRole.RESELLER) return "Reseller";
  return role;
}

export function groupOwnersByRole(owners: LineOwnerOption[]) {
  return {
    admins: owners.filter((o) => o.role === PanelRole.ADMIN),
    resellers: owners.filter((o) => o.role === PanelRole.RESELLER),
    subResellers: owners.filter((o) => o.role === PanelRole.SUB_RESELLER),
  };
}

/** Null = admin can see every line. Otherwise the owner ids this session may view/edit. */
export async function lineOwnerIdsForSession(session: SessionUser): Promise<string[] | null> {
  if (session.role === PanelRole.ADMIN) return null;
  const children = await prisma.panelUser.findMany({
    where: {
      parentId: session.id,
      role: { in: [PanelRole.RESELLER, PanelRole.SUB_RESELLER] },
    },
    select: { id: true },
  });
  return [session.id, ...children.map((c) => c.id)];
}

function andWhere(where: Prisma.LineWhereInput, clause: Prisma.LineWhereInput) {
  where.AND = [
    ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
    clause,
  ];
}

export async function adminOrLineOwnerWhere(
  session: SessionUser,
  id: string
): Promise<{ id: string; ownerId?: { in: string[] } }> {
  if (session.role === PanelRole.ADMIN) return { id };
  const ids = await lineOwnerIdsForSession(session);
  return { id, ownerId: { in: ids ?? [session.id] } };
}

/** ownerId query: role:ADMIN | role:RESELLER | role:SUB_RESELLER | mine | admin | user id */
export function applyOwnerFilter(
  where: Prisma.LineWhereInput,
  ownerFilter: string | undefined,
  session: SessionUser
) {
  const raw = (ownerFilter ?? "").trim();
  if (!raw) return;

  if (raw === "mine") {
    andWhere(where, { ownerId: session.id });
    return;
  }
  if (raw === "admin" || raw === "__none__") {
    andWhere(where, { ownerId: null });
    return;
  }
  if (raw === "role:ADMIN") {
    andWhere(where, {
      OR: [{ ownerId: null }, { owner: { role: PanelRole.ADMIN } }],
    });
    return;
  }
  if (raw === "role:RESELLER") {
    andWhere(where, { owner: { role: PanelRole.RESELLER } });
    return;
  }
  if (raw === "role:SUB_RESELLER" || raw === "subs") {
    andWhere(where, { owner: { role: PanelRole.SUB_RESELLER } });
    return;
  }
  andWhere(where, { ownerId: raw });
}
