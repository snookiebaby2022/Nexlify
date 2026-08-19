import { createHmac } from "crypto";
import { jwtSecretBytes } from "@/lib/jwt-secret";
import { secretsEqual } from "@/lib/secrets-equal";

const TTL_SEC = 120;

function secret(): Uint8Array {
  const bytes = jwtSecretBytes();
  if (bytes) return bytes;
  return new TextEncoder().encode("dev-secret-change-me");
}

export function mintAdminStreamProxyToken(url: string, userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = `${exp}.${userId}.${url}`;
  const sig = createHmac("sha256", Buffer.from(secret()))
    .update(payload)
    .digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyAdminStreamProxyToken(
  token: string,
  userId: string
): { ok: true; url: string } | { ok: false } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot <= 0) return { ok: false };
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = createHmac("sha256", Buffer.from(secret())).update(payload).digest("base64url");
    if (!secretsEqual(sig, expected)) return { ok: false };
    const firstDot = payload.indexOf(".");
    const secondDot = payload.indexOf(".", firstDot + 1);
    if (firstDot < 0 || secondDot < 0) return { ok: false };
    const exp = Number(payload.slice(0, firstDot));
    const uid = payload.slice(firstDot + 1, secondDot);
    const url = payload.slice(secondDot + 1);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return { ok: false };
    if (!secretsEqual(uid, userId) || !url) return { ok: false };
    return { ok: true, url };
  } catch {
    return { ok: false };
  }
}
