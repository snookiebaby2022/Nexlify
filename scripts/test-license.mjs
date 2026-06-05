#!/usr/bin/env node
/** Quick license diagnostics — run on VPS: node scripts/test-license.mjs [license_key] */
import { createPublicKey, verify } from "crypto";
import fs from "fs";
import path from "path";

const key = process.argv[2]?.trim();
const api = process.env.NEXLIFY_LICENSE_API_URL ?? "http://127.0.0.1:8787";

async function parseKey(raw) {
  if (!raw?.startsWith("NXLF1.")) return { ok: false, error: "Not NXLF1 key" };
  const rest = raw.slice(6);
  const dot = rest.lastIndexOf(".");
  const payloadB64 = rest.slice(0, dot);
  const sigB64 = rest.slice(dot + 1);
  const pem = fs.readFileSync(path.join(process.cwd(), ".license-keys", "public.pem"), "utf8");
  const message = Buffer.from(payloadB64);
  const ok = verify(null, message, createPublicKey(pem), Buffer.from(sigB64, "base64url"));
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  return { ok, payload, error: ok ? null : "Signature invalid" };
}

async function main() {
  console.log("API_URL", process.env.NEXLIFY_LICENSE_API_URL);
  console.log("SKIP", process.env.NEXLIFY_LICENSE_SKIP);
  console.log("REQUIRE_ONLINE", process.env.NEXLIFY_LICENSE_REQUIRE_ONLINE);
  try {
    const h = await fetch(`${api.replace(/\/$/, "")}/health`);
    console.log("license server health", h.status, await h.text());
  } catch (e) {
    console.log("license server health FAIL", e.message);
  }
  if (!key) {
    console.log("\nPass a key: node scripts/test-license.mjs NXLF1...");
    return;
  }
  const parsed = await parseKey(key);
  console.log("local verify", parsed);
  if (!parsed.ok) return;
  try {
    const res = await fetch(`${api.replace(/\/$/, "")}/v1/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: key,
        instance_id: "diag-test-instance",
        domain: "85.17.162.54",
      }),
    });
    console.log("online activate", res.status, await res.text());
  } catch (e) {
    console.log("online activate FAIL", e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
