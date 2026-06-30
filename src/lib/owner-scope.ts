import { PanelRole } from "@prisma/client";

/** Undefined for admin (full panel scope); panel user id for reseller roles. */
export function ownerScope(session: { role: PanelRole; id: string }) {
  return session.role === PanelRole.ADMIN ? undefined : session.id;
}

export function isPanelAdmin(role: PanelRole) {
  return role === PanelRole.ADMIN;
}
