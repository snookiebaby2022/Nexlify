import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { jwtSecretBytes } from "@/lib/jwt-secret";
import { panelSessionCookieOptions, panelSessionCookieSecure } from "@/lib/session-cookie";
import type { PanelRole } from "@prisma/client";

const COOKIE = "nexlify_session";
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

export type SessionUser = {
  id: string;
  username: string;
  role: PanelRole;
  credits: number;
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
  const cookieOpts = panelSessionCookieOptions(
    opts?.req,
    maxDays
  );
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

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.id as string,
      username: payload.username as string,
      role: payload.role as PanelRole,
      credits: payload.credits as number,
    };
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

async function repairAdminPasswordHash(password: string) {
  const installPass = process.env.INSTALL_ADMIN_PASSWORD?.trim();
  if (!installPass || installPass !== password) return null;

  const user = await prisma.panelUser.findUnique({ where: { username: "admin" } });
  if (!user) return null;

  const hash = await bcrypt.hash(password, 10);
  await prisma.panelUser.update({
    where: { username: "admin" },
    data: { passwordHash: hash, isActive: true, role: "ADMIN" },
  });
  return prisma.panelUser.findUnique({ where: { username: "admin" } });
}

export async function verifyPanelLogin(username: string, password: string) {
  const user = await prisma.panelUser.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    if (username === "admin") {
      const repaired = await repairAdminPasswordHash(password);
      if (repaired?.isActive) return repaired;
    }
    return null;
  }

  if (!BCRYPT_RE.test(user.passwordHash)) {
    if (username === "admin") {
      const repaired = await repairAdminPasswordHash(password);
      if (repaired) return repaired;
    }
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (ok) return user;

  if (username === "admin") {
    const repaired = await repairAdminPasswordHash(password);
    if (repaired && (await bcrypt.compare(password, repaired.passwordHash))) {
      return repaired;
    }
  }

  return null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
