import { createPublicKey, verify, createHash, randomUUID } from "crypto";
import type { LicensePayloadV1 } from "./types";
import { licensePublicKeyPem } from "./public-key";

const PREFIX = "NXLF1.";

export function normalizeLicenseKeyInput(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function parseLicenseKey(raw: string): { payload: LicensePayloadV1; key: string } | null {
  const key = normalizeLicenseKeyInput(raw);
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = rest.slice(0, dot);
  const sigB64 = rest.slice(dot + 1);
  try {
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as LicensePayloadV1;
    if (payload.v !== 1 || !payload.lid || !payload.exp) return null;
    // Must match scripts/license-sign.mjs (signs UTF-8 of the base64url segment, not decoded bytes)
    const data = Buffer.from(payloadB64);
    const sig = Buffer.from(sigB64, "base64url");
    const pub = createPublicKey(licensePublicKeyPem());
    const ok = verify(null, data, pub, sig);
    if (!ok) return null;
    return { payload, key };
  } catch {
    return null;
  }
}

export function licenseKeyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newInstanceId(): string {
  return randomUUID();
}

export function hostAllowed(payload: LicensePayloadV1, host: string): boolean {
  if (!payload.dom?.length) return true;
  const h = host.split(":")[0].toLowerCase();
  return payload.dom.some((d) => d.toLowerCase() === h);
}
