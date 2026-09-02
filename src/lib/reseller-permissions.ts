import { NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  mergeGroupConfig,
  PERMISSION_LABELS,
  RECOMMENDED_RESELLER_PERMISSIONS,
  RECOMMENDED_SUB_RESELLER_PERMISSIONS,
  RESELLER_PERMISSIONS,
} from "@/lib/group-config";
import { isAdminRole } from "@/lib/admin-access";

export const RESELLER_PERMS = {
  LINES_VIEW: "lines.view",
  LINES_CREATE: "lines.create",
  LINES_EDIT: "lines.edit",
  LINES_DELETE: "lines.delete",
  LINES_EXTEND: "lines.extend",
  LINES_TRIAL: "lines.trial",
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_EDIT: "users.edit",
  CREDITS_VIEW: "credits.view",
  CREDITS_TRANSFER: "credits.transfer",
  BOUQUETS_VIEW: "bouquets.view",
  BOUQUETS_EDIT: "bouquets.edit",
  STREAMS_VIEW: "streams.view",
  VOD_VIEW: "vod.view",
  MAG_VIEW: "mag.view",
  MAG_CREATE: "mag.create",
  TICKETS_VIEW: "tickets.view",
  TICKETS_CREATE: "tickets.create",
  EPG_VIEW: "epg.view",
  REPORTS_VIEW: "reports.view",
  API_ACCESS: "api.access",
  CONNECTIONS_VIEW: "connections.view",
  CONNECTIONS_KICK: "connections.kick",
} as const;

export type ResellerPermission = (typeof RESELLER_PERMS)[keyof typeof RESELLER_PERMS];

const CACHE_MS = 30_000;
const permCache = new Map<string, { at: number; perms: Set<string> }>();

function defaultPermissions(role: PanelRole): string[] {
  if (role === PanelRole.SUB_RESELLER) return [...RECOMMENDED_SUB_RESELLER_PERMISSIONS];
  return [...RECOMMENDED_RESELLER_PERMISSIONS];
}

export function describeResellerPermission(perm: string): string {
  return PERMISSION_LABELS[perm] ?? perm;
}

export function allResellerPermissionKeys(): string[] {
  return [...RESELLER_PERMISSIONS];
}

export async function loadResellerPermissionSet(
  userId: string,
  role: PanelRole
): Promise<Set<string>> {
  if (isAdminRole(role)) return new Set(RESELLER_PERMISSIONS);

  const cached = permCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.perms;

  const user = await prisma.panelUser.findUnique({
    where: { id: userId },
    select: { group: { select: { config: true, name: true } } },
  });
  const cfg = mergeGroupConfig(user?.group?.config);
  const perms = new Set(
    cfg.permissions.length ? cfg.permissions : defaultPermissions(role)
  );
  permCache.set(userId, { at: Date.now(), perms });
  return perms;
}

export async function listEffectiveResellerPermissions(
  userId: string,
  role: PanelRole
): Promise<{ permissions: string[]; labels: Record<string, string> }> {
  const set = await loadResellerPermissionSet(userId, role);
  const permissions = [...set].sort();
  const labels: Record<string, string> = {};
  for (const p of permissions) labels[p] = describeResellerPermission(p);
  return { permissions, labels };
}

export function bustResellerPermissionCache(userId?: string) {
  if (userId) permCache.delete(userId);
  else permCache.clear();
}

export async function hasResellerPermission(
  session: { id: string; role: PanelRole },
  perm: string
): Promise<boolean> {
  if (isAdminRole(session.role)) return true;
  if (session.role !== PanelRole.RESELLER && session.role !== PanelRole.SUB_RESELLER) {
    return false;
  }
  const perms = await loadResellerPermissionSet(session.id, session.role);
  return perms.has(perm);
}

export async function denyUnlessResellerPermission(
  session: { id: string; role: PanelRole } | null,
  perm: string
): Promise<NextResponse | null> {
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (isAdminRole(session.role)) return null;
  const ok = await hasResellerPermission(session, perm);
  if (!ok) {
    return NextResponse.json(
      { error: `Permission denied: ${describeResellerPermission(perm)}` },
      { status: 403 }
    );
  }
  return null;
}
