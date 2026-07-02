import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecretBytes } from "@/lib/jwt-secret";

const COOKIE = "nexlify_portal_session";

function secret() {
  const bytes = jwtSecretBytes();
  if (!bytes) throw new Error("JWT_SECRET is not set");
  return bytes;
}

export type PortalSession = {
  lineId: string;
  username: string;
};

export async function createPortalSession(line: { id: string; username: string }) {
  const token = await new SignJWT({ lineId: line.id, username: line.username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/portal",
    maxAge: 7 * 86400,
  });
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      lineId: String(payload.lineId),
      username: String(payload.username),
    };
  } catch {
    return null;
  }
}

export async function clearPortalSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
