#!/usr/bin/env node
/**
 * Issue a signed Nexlify license (vendor — requires .license-keys/private.pem)
 *
 * npm run license:issue -- --email customer@example.com --term 3m
 * Terms: 1m | 3m | 6m | 1y | unlimited
 */
import { resolveLicenseTerm } from "./license-terms.mjs";
import { signLicensePayload } from "./license-sign.mjs";

const args = process.argv.slice(2);
function arg(name, def = "") {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const email = arg("email", "customer@example.com");
const termRaw = arg("term", "1y");
const domain = arg("domain", "");
const bind = args.includes("--bind") || args.includes("--bind-on-activate");
const lid = arg("lid", `NX-${Date.now().toString(36)}`);

let termCfg;
try {
  termCfg = resolveLicenseTerm(termRaw);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const exp = Math.floor(Date.now() / 1000) + termCfg.days * 86400;
const payload = {
  v: 1,
  lid,
  sub: email,
  exp,
  term: termCfg.term,
  tier: termCfg.tier,
  iat: Math.floor(Date.now() / 1000),
  ...(domain ? { dom: domain.split(",").map((d) => d.trim()) } : {}),
  ...(bind ? { iid: "BIND_ON_ACTIVATE" } : {}),
};

const { key } = signLicensePayload(payload);
console.log("\nLicense key (give to customer):\n");
console.log(key);
console.log("\nTerm:", termCfg.label);
console.log("Expires:", new Date(exp * 1000).toISOString());
