import { createPublicKey, verify } from "crypto";

export const DEFAULT_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAwixEvcjHtGi9FFiheVssDyGRMkP85NBmZd5GUXqOiVA=
-----END PUBLIC KEY-----
`;

export function licensePublicKeyPem() {
  const fromEnv = process.env.NEXLIFY_LICENSE_PUBLIC_KEY?.trim()
    || process.env.LICENSE_SERVER_PUBLIC_PEM?.trim();
  if (!fromEnv) return DEFAULT_LICENSE_PUBLIC_KEY_PEM;
  return fromEnv.includes("BEGIN PUBLIC KEY")
    ? fromEnv
    : Buffer.from(fromEnv, "base64").toString("utf8");
}

export function parseLicenseKey(raw, publicPem = licensePublicKeyPem()) {
  const key = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!key.startsWith("NXLF1.")) return null;
  const rest = key.slice(6);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  try {
    const payloadB64 = rest.slice(0, dot);
    const sigB64 = rest.slice(dot + 1);
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (payload.v !== 1 || !payload.lid || !payload.exp) return null;
    const ok = verify(
      null,
      Buffer.from(payloadB64),
      createPublicKey(publicPem),
      Buffer.from(sigB64, "base64url")
    );
    if (!ok) return null;
    return { key, payload };
  } catch {
    return null;
  }
}

export function activateStatusError(admin) {
  if (admin?.status === "REVOKED") {
    return { status: "REVOKED", error: "License revoked" };
  }
  if (admin?.status === "SUSPENDED") {
    return { status: "SUSPENDED", error: "License suspended" };
  }
  return null;
}
