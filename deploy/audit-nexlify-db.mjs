import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "data/nexlify.db"));

console.log("=== Plans ===");
for (const p of db.prepare("SELECT slug, name, priceCents, whmcsProductId FROM Plan WHERE active=1 ORDER BY sortOrder").all()) {
  console.log(`${p.whmcsProductId ?? "-"} | ${p.slug} | ${p.name} | £${(p.priceCents / 100).toFixed(2)}`);
}

console.log("\n=== Addon products ===");
for (const a of db.prepare("SELECT service, name, whmcsProductId FROM AddonProduct WHERE active=1 ORDER BY sortOrder").all()) {
  console.log(`${a.whmcsProductId} | ${a.service} | ${a.name}`);
}
