import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { PanelRole } from "@prisma/client";

const COOKIE = "nexlify_session";

export type SessionUser = {
  id: string;
  username: string;
  role: PanelRole;
  credits: number;
};

function secret() {
  const s =
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-me");
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionCookieOptions = {
  secure?: boolean;
  clientIp?: string;
  maxAgeDays?: number;
};

export async function createSession(user: SessionUser, opts?: SessionCookieOptions) {
  const maxDays = opts?.maxAgeDays ?? 7;
  const token = await new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
    credits: user.credits,
    clientIp: opts?.clientIp ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${maxDays}d`)
    .sign(secret());

  const jar = await cookies();
  const secure = opts?.secure ?? process.env.PANEL_COOKIE_SECURE === "1";
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * maxDays,
  });
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

export async function verifyPanelLogin(username: string, password: string) {
  const user = await prisma.panelUser.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
