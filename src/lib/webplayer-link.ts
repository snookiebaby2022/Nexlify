import { SignJWT, jwtVerify } from "jose";
import { jwtSecretBytes } from "@/lib/jwt-secret";

const TYP = "webplayer_link";
const TTL = "2h";

function secret() {
  const bytes = jwtSecretBytes();
  if (!bytes) throw new Error("JWT_SECRET is not set");
  return bytes;
}

export async function createWebplayerLinkToken(lineId: string): Promise<string> {
  return new SignJWT({ typ: TYP, lineId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(TTL)
    .sign(secret());
}

export async function readWebplayerLinkLineId(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== TYP) return null;
    const id = String(payload.lineId ?? "");
    return id || null;
  } catch {
    return null;
  }
}
