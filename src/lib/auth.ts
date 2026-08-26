import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hashPassword } from "./password-hash";
import { prisma } from "./prisma";
import { jwtSecretBytes } from "@/lib/jwt-secret";
import { panelSessionCookieOptions, panelSessionCookieSecure } from "@/lib/session-cookie";
import { secretsEqual, BCRYPT_HASH_RE, canRepairAdminHash } from "@/lib/secrets-equal";
import { verifyStoredPassword } from "@/lib/password-verify";
import type { PanelRole } from "@prisma/client";
import { hasPermission, type StaffPermission } from "./staff-permissions";

const COOKIE = "nexlify_session";

export type SessionUser = {
  id: string;
  username: string;
  role: PanelRole;
  credits: number;
  permissions: string[];
};

function secret() {
  const bytes = jwtSecretBytes();
  if (!bytes) throw new Error("JWT_SECRET is not set");
  return bytes;
}

export type SessionCookieOptions = {
  secure?: boolean;
  clientIp?: string;
  maxAgeDays?: number;
  req?: NextRequest;
};

export async function createSessionToken(
  user: SessionUser,
  opts?: Pick<SessionCookieOptions, "clientIp" | "maxAgeDays">
): Promise<string> {
  const maxDays = opts?.maxAgeDays ?? 7;
  return new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
    credits: user.credits,
    clientIp: opts?.clientIp ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${maxDays}d`)
    .sign(secret());
}

export async function createSession(user: SessionUser, opts?: SessionCookieOptions) {
  const maxDays = opts?.maxAgeDays ?? 7;
  const token = await createSessionToken(user, opts);
  const jar = await cookies();
  const cookieOpts = panelSessionCookieOptions(opts?.req, maxDays);
  if (opts?.secure !== undefined) {
    cookieOpts.secure = opts.secure;
  } else if (!opts?.req) {
    cookieOpts.secure = panelSessionCookieSecure();
  }
  jar.set(COOKIE, token, cookieOpts);
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

const SESSION_USER_TTL_MS = 5_000;
const sessionUserCache = new Map<string, { at: number; user: SessionUser | null }>();

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = String(payload.id ?? "");
    if (!id) return null;
    const cached = sessionUserCache.get(id);
    if (cached && Date.now() - cached.at < SESSION_USER_TTL_MS) return cached.user;

    const row = await prisma.panelUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        credits: true,
        isActive: true,
        permissions: true,
      },
    });
    const user =
      row?.isActive
        ? {
            id: row.id,
            username: row.username,
            role: row.role,
            credits: row.credits,
            permissions: row.permissions ?? [],
          }
        : null;
    sessionUserCache.set(id, { at: Date.now(), user });
    if (sessionUserCache.size > 2000) sessionUserCache.clear();
    return user;
  } catch {
    return null;
  }
}

export async function requireSession(roles?: PanelRole[]) {
  const session = await getSession();
  if (!session) return null;
  if (roles && !roles.includes(session.role)) return null;
  return session;
}

export async function requirePermission(perm: StaffPermission | string) {
  const session = await getSession();
  if (!session) return null;
  if (!hasPermission(session, perm)) return null;
  return session;
}

async function repairAdminPasswordHash(password: string) {
  const installPass = process.env.INSTALL_ADMIN_PASSWORD?.trim();
  if (!installPass || !secretsEqual(password, installPass)) return null;

  const user = await prisma.panelUser.findFirst({
    where: { username: { equals: "admin", mode: "insensitive" }, role: "ADMIN" },
  });
  if (!user) return null;

  const hash = await hashPassword(password);
  await prisma.panelUser.update({
    where: { id: user.id },
    data: { passwordHash: hash, passwordPlain: null, isActive: true, role: "ADMIN" },
  });
  return prisma.panelUser.findUnique({ where: { id: user.id } });
}

const ADMIN_IDENTIFIERS = new Set(["admin", "admin@nexlify.live"]);

/** After a successful legacy ($6$) login, upgrade to bcrypt. */
async function upgradeLegacyPasswordHash(userId: string, password: string, storedHash: string) {
  if (BCRYPT_HASH_RE.test(storedHash)) return;
  try {
    const hash = await hashPassword(password);
    await prisma.panelUser.update({
      where: { id: userId },
      data: { passwordHash: hash, passwordPlain: null },
    });
  } catch (err) {
    console.error("[auth] password upgrade failed:", err);
  }
}

export async function verifyPanelLogin(identifier: string, password: string) {
  const id = identifier.trim();
  // Prefer exact match, then case-insensitive — usernames like "Iconic" failed for "iconic".
  const user =
    (await prisma.panelUser.findFirst({
      where: {
        OR: [{ username: id }, { email: id }],
      },
    })) ??
    (await prisma.panelUser.findFirst({
      where: {
        OR: [
          { username: { equals: id, mode: "insensitive" } },
          { email: { equals: id, mode: "insensitive" } },
        ],
      },
    }));
  const idLower = id.toLowerCase();
  const isAdminTarget =
    ADMIN_IDENTIFIERS.has(idLower) &&
    (!user || user.role === "ADMIN");

  if (!user || !user.isActive) {
    if (canRepairAdminHash({ isAdminTarget, user })) {
      const repaired = await repairAdminPasswordHash(password);
      if (repaired?.isActive) return repaired;
    }
    return null;
  }

  const hash = user.passwordHash ?? "";
  const hashLooksValid = BCRYPT_HASH_RE.test(hash) || hash.startsWith("$6$");
  if (!hashLooksValid) {
    if (canRepairAdminHash({ isAdminTarget, user })) {
      const repaired = await repairAdminPasswordHash(password);
      if (repaired) return repaired;
    }
    return null;
  }

  const ok = await verifyStoredPassword(password, hash);
  if (!ok) return null;

  // Transparent upgrade: XUI $6$ → bcrypt.
  if (hash.startsWith("$6$")) {
    void upgradeLegacyPasswordHash(user.id, password, hash);
  }

  return user;
}

export { hashPassword } from "./password-hash";

export function requirePanelApiKey(request: Request): boolean {
  const expected =
    process.env.PANEL_API_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error("[auth] PANEL_API_SECRET is not set — remote admin API blocked");
    }
    return false;
  }
  const provided =
    request.headers.get("x-panel-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return secretsEqual(provided, expected);
}
