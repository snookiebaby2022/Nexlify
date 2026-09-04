import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Undefined for admin (full panel scope); panel user id for reseller roles. */
export function ownerScope(session: { role: PanelRole; id: string }) {
  return session.role === PanelRole.ADMIN ? undefined : session.id;
}

/** Reseller + their direct sub-resellers. Undefined = whole panel (admin). */
export async function ownerLineOwnerIds(session: {
  role: PanelRole;
  id: string;
}): Promise<string[] | undefined> {
  if (session.role === PanelRole.ADMIN) return undefined;
  const children = await prisma.panelUser.findMany({
    where: { parentId: session.id },
    select: { id: true },
  });
  return [session.id, ...children.map((c) => c.id)];
}

export function isPanelAdmin(role: PanelRole) {
  return role === PanelRole.ADMIN;
}
