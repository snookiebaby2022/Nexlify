import { PrismaClient } from "@prisma/client";
import { createGunzip } from "zlib";
import { createReadStream } from "fs";
import { readdirSync } from "fs";
import { join } from "path";

const dir = "/var/lib/nexlify/catalog-cache";
const files = readdirSync(dir).filter((f) => f.startsWith("xtream-live-") && f.endsWith(".json.gz"));
const latest = files.sort().pop();
if (!latest) {
  console.log("no catalog");
  process.exit(1);
}
console.log("file", latest);

const chunks = [];
await new Promise((resolve, reject) => {
  createReadStream(join(dir, latest))
    .pipe(createGunzip())
    .on("data", (c) => chunks.push(c))
    .on("end", resolve)
    .on("error", reject);
});
const bulk = JSON.parse(Buffer.concat(chunks).toString("utf8"));
console.log("bulk len", bulk.length);
const ukId = 707056019;
const match = bulk.filter((s) => Number(s.category_id) === ukId || String(s.category_id) === String(ukId));
const matchIds = bulk.filter((s) => Array.isArray(s.category_ids) && s.category_ids.includes(ukId));
const emptyIcon = match.filter((s) => !s.stream_icon?.trim());
console.log("uk match category_id", match.length, "category_ids", matchIds.length, "empty icon", emptyIcon.length);
console.log("sample", JSON.stringify(match[0] ?? null));
console.log("typeof category_id", typeof match[0]?.category_id);
await new PrismaClient().$disconnect();
