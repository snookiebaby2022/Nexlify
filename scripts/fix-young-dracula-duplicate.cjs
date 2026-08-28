#!/usr/bin/env node
/** Remove duplicate Young Dracula row (bad URL) on server 45. Keeps cmsw4zx6x… */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const GOOD_ID = "cmsw4zx6x078pvheegh907kqk";
const BAD_ID = "cmtckpyh508wnvhn4uuzji4h4";

(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const good = await p.stream.findUnique({ where: { id: GOOD_ID } });
  const bad = await p.stream.findUnique({ where: { id: BAD_ID } });
  if (!good) throw new Error(`Good stream ${GOOD_ID} not found`);
  if (!bad) {
    console.log(JSON.stringify({ ok: true, message: "Bad duplicate already removed" }, null, 2));
    await p.$disconnect();
    return;
  }
  console.log(JSON.stringify({ good: { id: good.id, url: good.streamUrl }, bad: { id: bad.id, url: bad.streamUrl } }, null, 2));
  if (!dryRun) {
    await p.bouquetStream.deleteMany({ where: { streamId: BAD_ID } });
    await p.stream.delete({ where: { id: BAD_ID } });
  }
  console.log(JSON.stringify({ removed: BAD_ID, dryRun }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
