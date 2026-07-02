#!/usr/bin/env node
/** Write NEXLIFY_LICENSE_VALID=1 to .env when NEXLIFY_LICENSE_KEY is present and valid. */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createPublicKey, verify } from "crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function readEnvFile() {
  try {
    return readFileSync(envPath, "utf8");
  } catch {
    return "";
  }
}

function getEnvValue(text, key) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) return "";
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  return `${text.replace(/\s*$/, "")}\n${line}\n`;
}

function publicKeyPem() {
  return `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAYwo0NG7c53ltWwIz2dju4S2sBo0NtnRYI3YANGKIREg=
-----END PUBLIC KEY-----`;
}

function parseLicenseKey(raw) {
  const key = raw.trim().replace(/\s+/g, "");
  const PREFIX = "NXLF1.";
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = rest.slice(0, dot);
  const sigB64 = rest.slice(dot + 1);
  try {
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    if (payload.v !== 1 || !payload.lid || !payload.exp) return null;
    const pem = publicKeyPem();
    if (!pem) return null;
    const ok = verify(null, Buffer.from(payloadB64), createPublicKey(pem), Buffer.from(sigB64, "base64url"));
    if (!ok) return null;
    return { payload, key };
  } catch {
    return null;
  }
}

let text = readEnvFile();
const licenseKey = getEnvValue(text, "NEXLIFY_LICENSE_KEY");
if (!licenseKey) {
  text = setEnvValue(text, "NEXLIFY_LICENSE_VALID", "0");
  writeFileSync(envPath, text);
  console.log("No NEXLIFY_LICENSE_KEY — cleared NEXLIFY_LICENSE_VALID");
  process.exit(0);
}

const parsed = parseLicenseKey(licenseKey);
const valid = parsed && parsed.payload.exp * 1000 > Date.now() ? "1" : "0";
text = setEnvValue(text, "NEXLIFY_LICENSE_VALID", valid);
writeFileSync(envPath, text);
console.log(`NEXLIFY_LICENSE_VALID=${valid}`);
process.exit(valid === "1" ? 0 : 1);
