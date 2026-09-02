import { PanelRole } from "@prisma/client";
import { logActivity } from "@/lib/lines";

/** Full panel override — admins bypass reseller/staff ownership and permission gates. */
export function isAdminRole(role: PanelRole): boolean {
  return role === PanelRole.ADMIN;
}

/** Prisma where clause: admin sees any row; resellers only their own. */
export function adminOrOwnerWhere(session: { role: PanelRole; id: string }, id: string) {
  return session.role === PanelRole.ADMIN ? { id } : { id, ownerId: session.id };
}

export async function logAdminCredentialChange(opts: {
  userId: string;
  entity: string;
  entityId: string;
  field: string;
  meta?: Record<string, unknown>;
}) {
  await logActivity("admin_credential_change", {
    userId: opts.userId,
    entity: opts.entity,
    entityId: opts.entityId,
    meta: { field: opts.field, ...opts.meta },
  });
}
