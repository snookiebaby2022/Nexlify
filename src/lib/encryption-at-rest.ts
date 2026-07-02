import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function keyBytes(): Buffer {
  const raw =
    process.env.ENCRYPTION_AT_REST_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.LICENSE_SESSION_SECRET?.trim();
  if (!raw || raw === "dev-secret-change-me" || raw.length < 16) {
    throw new Error("Set ENCRYPTION_AT_REST_KEY (32+ chars) for encrypted storage");
  }
  return createHash("sha256").update(raw).digest();
}

/** AES-256-GCM envelope for sensitive panel settings (e.g. license.raw). */
export function encryptAtRest(plaintext: string): string {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `${PREFIX}${blob}`;
}

export function decryptAtRest(stored: string): string {
  const value = stored.trim();
  if (!value.startsWith(PREFIX)) return value;
  const key = keyBytes();
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function isEncryptedAtRest(stored: string): boolean {
  return stored.trim().startsWith(PREFIX);
}
