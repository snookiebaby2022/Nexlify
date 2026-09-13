import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mergeGroupConfig } from "@/lib/group-config";
import { loadResellerPermissionSet } from "@/lib/reseller-permissions";

function isSubResellerGroupName(name: string): boolean {
  return /sub-?reseller/i.test(name.trim());
}

function groupRoleOf(g: { name: string; isReseller: boolean; config: unknown }): string {
  const cfg = mergeGroupConfig(g.config);
  return (
    cfg.groupRole ??
    (g.isReseller && isSubResellerGroupName(g.name)
      ? "sub_reseller"
      : g.isReseller
        ? "reseller"
        : "admin")
  );
}

export function resellerMayAssignGroup(
  group: { name: string; isReseller: boolean; config: unknown } | null,
  parentPerms: Set<string>
): { ok: true } | { ok: false; error: string } {
  if (!group) return { ok: false, error: "Group not found" };

  const role = groupRoleOf(group);
  if (role === "admin" || role === "reseller") {
    return { ok: false, error: "That group cannot be assigned to a sub-reseller" };
  }

  const cfg = mergeGroupConfig(group.config);
  const groupPerms = cfg.permissions;
  if (!groupPerms.length) {
    return { ok: false, error: "Group has no explicit permissions" };
  }
  for (const perm of groupPerms) {
    if (!parentPerms.has(perm)) {
      return { ok: false, error: "Group grants permissions you do not have" };
    }
  }
  return { ok: true };
}

/** Resellers may only attach sub-reseller groups whose perms ⊆ their own. */
export async function assertResellerAssignableGroupId(
  session: { id: string; role: PanelRole },
  groupId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!groupId) return { ok: true };

  const group = await prisma.userGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, isReseller: true, config: true },
  });
  const parentPerms = await loadResellerPermissionSet(session.id, session.role);
  return resellerMayAssignGroup(group, parentPerms);
}
