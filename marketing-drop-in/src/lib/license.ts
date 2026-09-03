import { createPrivateKey, sign } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function durationDaysToTerm(days: number): string {
  if (days <= 0 || days >= 36500) return "unlimited";
  if (days <= 35) return "1m";
  if (days <= 100) return "3m";
  if (days <= 200) return "6m";
  return "1y";
}

function getTermDays(term: string): number {
  switch (term) {
    case "1m": return 30;
    case "3m": return 90;
    case "6m": return 180;
    case "1y": return 365;
    case "unlimited": return 36500;
    default: return 30;
  }
}

function loadPrivateKeyPem(): string | null {
  const fromEnv = process.env.LICENSE_SERVER_PRIVATE_PEM?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    process.env.LICENSE_KEY_FILE?.trim(),
    join(process.cwd(), ".license-keys", "private.pem"),
    "/var/www/nexlify/.license-keys/private.pem",
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8").trim();
    } catch {
      /* try next path */
    }
  }

  return null;
}

function loadPrivateKey() {
  const pem = loadPrivateKeyPem();
  if (!pem) return null;
  return createPrivateKey(pem);
}

function signPayload(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const priv = loadPrivateKey();
  if (!priv) throw new Error("license_signing_key_missing");
  const sig = sign(null, Buffer.from(payloadB64), priv);
  return `NXLF1.${payloadB64}.${sig.toString("base64url")}`;
}

/** Generate a signed NXLF1 license key locally (no license server needed). */
export async function requestLicenseKey(opts: {
  email: string;
  durationDays?: number;
  term?: string;
}): Promise<string> {
  const term =
    opts.term?.trim() ||
    durationDaysToTerm(opts.durationDays ?? 365);
  const termDays = getTermDays(term);
  const exp = Math.floor(Date.now() / 1000) + termDays * 86400;
  const lid = `NX-${Date.now().toString(36)}`;

  const payload = {
    v: 1,
    lid,
    sub: opts.email,
    exp,
    term,
    tier: term === "unlimited" ? "unlimited" : "1y",
    iat: Math.floor(Date.now() / 1000),
    iid: "BIND_ON_ACTIVATE",
  };

  return signPayload(payload);
}

export async function uniqueLicenseKey(
  email: string,
  durationDays: number,
  term?: string
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await requestLicenseKey({ email, durationDays, term });
    const existing = await prisma.license.findUnique({ where: { key } });
    if (!existing) return key;
  }
  throw new Error("Failed to generate a unique license key");
}
