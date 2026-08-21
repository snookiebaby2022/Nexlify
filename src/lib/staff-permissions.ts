import type { PanelRole } from "@prisma/client";

/** Fine-grained staff permissions (STAFF role only — ADMIN has full access). */
export const PERMS = {
  LINES_READ: "lines:read",
  LINES_WRITE: "lines:write",
  STREAMS_READ: "streams:read",
  STREAMS_WRITE: "streams:write",
  EPG_READ: "epg:read",
  EPG_WRITE: "epg:write",
  VOD_READ: "vod:read",
  VOD_WRITE: "vod:write",
  CONNECTIONS_READ: "connections:read",
  CONNECTIONS_KICK: "connections:kick",
  RESELLERS_READ: "resellers:read",
  RESELLERS_WRITE: "resellers:write",
  TICKETS_READ: "tickets:read",
  TICKETS_WRITE: "tickets:write",
  LOGS_READ: "logs:read",
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
  DVR_READ: "dvr:read",
  DVR_WRITE: "dvr:write",
  APP_BUILDER: "app_builder:write",
  API_ACCESS: "api:access",
} as const;

export type StaffPermission = (typeof PERMS)[keyof typeof PERMS];

export type PermissionUser = {
  role: PanelRole;
  permissions?: string[] | null;
};

/** Built-in presets for common staff roles. */
export const STAFF_PRESETS: Record<string, StaffPermission[]> = {
  support_agent: [
    PERMS.LINES_READ,
    PERMS.CONNECTIONS_READ,
    PERMS.CONNECTIONS_KICK,
    PERMS.TICKETS_READ,
    PERMS.TICKETS_WRITE,
    PERMS.LOGS_READ,
  ],
  content_admin: [
    PERMS.STREAMS_READ,
    PERMS.STREAMS_WRITE,
    PERMS.EPG_READ,
    PERMS.EPG_WRITE,
    PERMS.VOD_READ,
    PERMS.VOD_WRITE,
  ],
  operations: [
    PERMS.STREAMS_READ,
    PERMS.CONNECTIONS_READ,
    PERMS.CONNECTIONS_KICK,
    PERMS.LOGS_READ,
    PERMS.DVR_READ,
    PERMS.DVR_WRITE,
    PERMS.SETTINGS_READ,
  ],
  billing: [PERMS.RESELLERS_READ, PERMS.LINES_READ, PERMS.LOGS_READ],
};

export function isAdmin(user: PermissionUser): boolean {
  return user.role === "ADMIN";
}

export function hasPermission(user: PermissionUser, perm: string): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "RESELLER" || user.role === "SUB_RESELLER") return false;
  if (user.role === "STAFF") return (user.permissions ?? []).includes(perm);
  return false;
}

export function hasAnyPermission(user: PermissionUser, perms: string[]): boolean {
  return perms.some((p) => hasPermission(user, p));
}

export function permissionsForPreset(preset: string): StaffPermission[] {
  return STAFF_PRESETS[preset] ?? [];
}

export function describePermission(perm: string): string {
  const map: Record<string, string> = {
    [PERMS.LINES_READ]: "View lines",
    [PERMS.LINES_WRITE]: "Create/edit lines",
    [PERMS.STREAMS_READ]: "View streams",
    [PERMS.STREAMS_WRITE]: "Manage streams",
    [PERMS.EPG_READ]: "View EPG",
    [PERMS.EPG_WRITE]: "Manage EPG",
    [PERMS.VOD_READ]: "View VOD/series",
    [PERMS.VOD_WRITE]: "Manage VOD/series",
    [PERMS.CONNECTIONS_READ]: "View live connections",
    [PERMS.CONNECTIONS_KICK]: "Kick connections",
    [PERMS.RESELLERS_READ]: "View resellers",
    [PERMS.RESELLERS_WRITE]: "Manage resellers",
    [PERMS.TICKETS_READ]: "View tickets",
    [PERMS.TICKETS_WRITE]: "Manage tickets",
    [PERMS.LOGS_READ]: "View logs",
    [PERMS.SETTINGS_READ]: "View settings",
    [PERMS.SETTINGS_WRITE]: "Change settings",
    [PERMS.DVR_READ]: "View DVR library",
    [PERMS.DVR_WRITE]: "Manage DVR recordings",
    [PERMS.APP_BUILDER]: "App builder",
    [PERMS.API_ACCESS]: "Admin API access",
  };
  return map[perm] ?? perm;
}
