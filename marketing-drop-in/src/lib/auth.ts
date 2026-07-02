import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

const COOKIE_NAME = "stream_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;

export function isValidBcryptHash(hash: string): boolean {
  return BCRYPT_HASH_RE.test(hash);
}

export async function repairAdminPasswordIfCorrupted(user: {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
}): Promise<string> {
  if (isValidBcryptHash(user.passwordHash)) {
    return user.passwordHash;
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@nexlify.live").trim().toLowerCase();
  if (user.email !== adminEmail || user.role !== "ADMIN") {
    return user.passwordHash;
  }

  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword || adminPassword.length < 8) {
    return user.passwordHash;
  }

  console.error(
    `[auth] Corrupted password hash for ${user.email} — repairing from ADMIN_PASSWORD`,
  );
  const passwordHash = await hashPassword(adminPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, role: "ADMIN" },
  });
  return passwordHash;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set (min 32 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || typeof payload.email !== "string") {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      role: (payload.role as Role) ?? "USER",
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true },
  });

  return user;
}

export function requirePanelApiKey(request: Request): boolean {
  const expected =
    process.env.PANEL_API_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim();
  if (!expected) return false;
  const provided =
    request.headers.get("x-panel-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === expected;
}
