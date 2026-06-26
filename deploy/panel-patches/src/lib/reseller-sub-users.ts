import { PanelRole } from "@prisma/client";

/** Direct sub-users owned by the logged-in reseller or sub-reseller. */
export function directSubUserWhere(parentId: string) {
  return {
    parentId,
    role: PanelRole.SUB_RESELLER,
  } as const;
}

export function canManageSubUsers(role: PanelRole) {
  return role === PanelRole.RESELLER || role === PanelRole.SUB_RESELLER;
}
