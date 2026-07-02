#!/usr/bin/env node
/**
 * Regenerate .license-keys/public.pem from private.pem (fixes mismatched key pairs).
 * Then run: npm run license:sync-public-key && npm run build
 */
import { createPrivateKey, createPublicKey } from "crypto";
import fs from "fs";
import path from "path";

const root = process.cwd();
const privPath = path.join(root, ".license-keys", "private.pem");
const pubPath = path.join(root, ".license-keys", "public.pem");

if (!fs.existsSync(privPath)) {
  console.error("Missing .license-keys/private.pem");
  process.exit(1);
}

const privPem = fs.readFileSync(privPath, "utf8");
const pubPem = createPublicKey(createPrivateKey(privPem)).export({
  type: "spki",
  format: "pem",
});

fs.writeFileSync(pubPath, pubPem);
console.log("Wrote", pubPath);
