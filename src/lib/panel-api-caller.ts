import { NextRequest } from "next/server";
import { PanelRole, Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hasPermission, PERMS } from "@/lib/staff-permissions";
import {
  hmacHex,
  hmacHexEqual,
  hmacPayloadFromSearchParams,
} from "@/lib/xui-api-utils";
import { normalizeDomain } from "@/lib/domains-host";
import { verifyPanelLogin } from "@/lib/auth";
import { clientIp } from "@/lib/middleware-runtime";
import { ipMatchesRule } from "@/lib/line-ip-lock";
import { verifyTotpCode } from "@/lib/totp";
import { getSettingGroup } from "@/lib/panel-settings";
import { hasResellerPermission, RESELLER_PERMS } from "@/lib/reseller-permissions";

export type PanelApiCaller = {
  id: string;
  username: string;
  role: PanelRole;
  /** Full panel access (admin or staff with api:access). */
  isAdmin: boolean;
  isReseller: boolean;
  resellerDns: string | null;
};

/** XUI actions resellers may call on /api/v1 (scoped to their tree). */
export const RESELLER_PANEL_API_ACTIONS = new Set([
  "get_lines",
  "get_line",
  "get_line_status",
  "create_line",
  "edit_line",
  "disable_line",
  "enable_line",
  "ban_line",
  "unban_line",
  "delete_line",
  "renew_line",
  "set_line_bouquets",
  "kick_user",
  "kill_user",
  "kill_connection",
  "kill_connections",
  "get_bouquets",
  "get_bouquet_streams",
  "get_packages",
  "get_users",
  "user_info",
  "get_resellers",
  "get_reg_users",
  "create_reseller",
  "add_credits",
  "edit_user",
  "live_connections",
  "get_analytics",
  "activity_logs",
  "get_streams",
  "get_movies",
  "get_series",
]);

export function generatePanelApiKey(): string {
  return randomBytes(24).toString("hex");
}

export function callerFromUser(user: {
  id: string;
  username: string;
  role: PanelRole;
  resellerDns?: string | null;
}): PanelApiCaller {
  const isAdmin =
    user.role === PanelRole.ADMIN ||
    (user.role === PanelRole.STAFF && false); // staff checked at auth time
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isAdmin: user.role === PanelRole.ADMIN,
    isReseller: user.role === PanelRole.RESELLER || user.role === PanelRole.SUB_RESELLER,
    resellerDns: user.resellerDns ?? null,
  };
}

export async function authenticatePanelApi(
  req: NextRequest,
  params?: URLSearchParams
): Promise<PanelApiCaller | null> {
  const p = params ?? req.nextUrl.searchParams;
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const token = authorization.match(/^Token\s+(.+)$/i)?.[1]?.trim();
  const [bearerKey, bearerToken] = bearer?.split(/:([\s\S]*)/, 2) ?? [];
  const apiKey =
    p.get("api_key") ??
    req.headers.get("x-api-key") ??
    (token || bearerKey);
  const accessCode = p.get("access_code") ?? bearerToken;
  const username = p.get("username") ?? p.get("user");
  const password = p.get("password") ?? p.get("pass");
  const ip = clientIp(req);
  const ipSetting = await prisma.panelSetting.findUnique({ where: { key: "ipWhitelist" } });
  const ipRules = (ipSetting?.value ?? "").split(/[\s,]+/).filter(Boolean);
  if (ipRules.length > 0 && !ipRules.some((rule) => ipMatchesRule(ip, rule))) return null;

  const hmacSig = req.headers.get("x-nexlify-signature") ?? p.get("hmac");
  const hmacKey = await prisma.panelSetting.findUnique({ where: { key: "hmac_api_secret" } });
  if (hmacSig && hmacKey?.value) {
    const expected = hmacHex(hmacKey.value, hmacPayloadFromSearchParams(p));
    if (!hmacHexEqual(hmacSig, expected)) return null;
  }

  const passwordAuth = !apiKey && Boolean(username && password);
  const user = apiKey
    ? await prisma.panelUser.findFirst({
        where: {
          apiKey,
          isActive: true,
          ...(accessCode ? { accessCode } : {}),
          OR: [
            { role: PanelRole.ADMIN },
            { role: PanelRole.STAFF, permissions: { has: PERMS.API_ACCESS } },
            { role: PanelRole.RESELLER },
            { role: PanelRole.SUB_RESELLER },
          ],
        },
        select: {
          id: true,
          username: true,
          role: true,
          permissions: true,
          resellerDns: true,
          totpEnabled: true,
          totpSecret: true,
        },
      })
    : username && password
      ? await verifyPanelLogin(username, password)
      : null;
  if (!user) return null;
  if (user.role === PanelRole.STAFF && !hasPermission(user, PERMS.API_ACCESS)) return null;

  const caller = callerFromUser(user);
  if (caller.isReseller) {
    const allowed = await hasResellerPermission(caller, RESELLER_PERMS.API_ACCESS);
    if (!allowed) return null;
  }
  if (passwordAuth) {
    const totpCode = p.get("totpCode") ?? p.get("totp_code") ?? "";
    const security = await getSettingGroup("security").catch(() => ({} as Record<string, unknown>));
    const requiresTotp =
      Boolean(user.totpEnabled && user.totpSecret) ||
      (user.role === PanelRole.ADMIN && security.totpRequiredForAdmins === true) ||
      ((user.role === PanelRole.RESELLER || user.role === PanelRole.SUB_RESELLER) &&
        security.totpRequiredForResellers === true);
    if (requiresTotp && (!user.totpSecret || !totpCode || !verifyTotpCode(user.totpSecret, totpCode))) {
      return null;
    }
  }
  if (user.role === PanelRole.STAFF) {
    return { ...caller, isAdmin: true, isReseller: false };
  }
  return caller;
}

/** @deprecated Use authenticatePanelApi */
export async function authenticateAdminApi(req: NextRequest, params?: URLSearchParams) {
  const caller = await authenticatePanelApi(req, params);
  if (!caller?.isAdmin) return null;
  return prisma.panelUser.findFirst({
    where: { id: caller.id, isActive: true },
  });
}

export function assertPanelApiActionAllowed(
  action: string,
  caller: PanelApiCaller
): { ok: true } | { ok: false; message: string } {
  if (caller.isAdmin) return { ok: true };
  if (RESELLER_PANEL_API_ACTIONS.has(action)) return { ok: true };
  return { ok: false, message: `action not allowed for reseller API: ${action}` };
}

export function lineScopeWhere(caller: PanelApiCaller): Prisma.LineWhereInput {
  if (caller.isAdmin) return {};
  return { ownerId: caller.id };
}

export function userScopeWhere(caller: PanelApiCaller): Prisma.PanelUserWhereInput {
  if (caller.isAdmin) return {};
  return { OR: [{ id: caller.id }, { parentId: caller.id }] };
}

export function connectionScopeWhere(caller: PanelApiCaller): Prisma.LiveConnectionWhereInput {
  if (caller.isAdmin) return {};
  return { line: { ownerId: caller.id } };
}

export async function assertLineInScope(
  lineId: string,
  caller: PanelApiCaller
): Promise<{ ok: true; line: { id: string; ownerId: string | null } } | { ok: false; message: string }> {
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: { id: true, ownerId: true },
  });
  if (!line) return { ok: false, message: "not found" };
  if (caller.isAdmin) return { ok: true, line };
  if (line.ownerId !== caller.id) return { ok: false, message: "not found" };
  return { ok: true, line };
}

export async function assertUserInScope(
  userId: string,
  caller: PanelApiCaller
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (caller.isAdmin) return { ok: true };
  if (userId === caller.id) return { ok: true };
  const child = await prisma.panelUser.findFirst({
    where: { id: userId, parentId: caller.id },
    select: { id: true },
  });
  if (!child) return { ok: false, message: "not found" };
  return { ok: true };
}

export async function assertUserByUsernameInScope(
  username: string,
  caller: PanelApiCaller
): Promise<
  | { ok: true; user: { id: string; username: string; role: PanelRole; credits: number; parentId: string | null } }
  | { ok: false; message: string }
> {
  const user = await prisma.panelUser.findUnique({
    where: { username },
    select: { id: true, username: true, role: true, credits: true, parentId: true },
  });
  if (!user) return { ok: false, message: "not found" };
  const scope = await assertUserInScope(user.id, caller);
  if (!scope.ok) return { ok: false, message: "not found" };
  return { ok: true, user };
}

export function resellerApiBaseUrl(
  caller: PanelApiCaller,
  requestOrigin: string
): string {
  const origin = requestOrigin.replace(/\/$/, "");
  if (caller.resellerDns) {
    const host = normalizeDomain(caller.resellerDns);
    if (host) return `https://${host}`;
  }
  return origin;
}
