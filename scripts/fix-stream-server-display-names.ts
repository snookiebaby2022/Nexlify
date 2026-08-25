/**
 * Rename StreamServer rows whose name is a version label (e.g. XUI "1.5.13") to the host.
 * Usage: npx tsx scripts/fix-stream-server-display-names.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const servers = await prisma.streamServer.findMany({
    select: { id: true, name: true, host: true, domain: true },
  });
  let updated = 0;
  for (const s of servers) {
    const name = (s.name ?? "").trim();
    const host = (s.domain || s.host || "").trim();
    if (!host) continue;
    // Version-like names from XUI migration
    if (/^\d+\.\d+(\.\d+)?([.\d]*)?$/.test(name) && name !== host) {
      await prisma.streamServer.update({
        where: { id: s.id },
        data: { name: host },
      });
      updated++;
      console.log(`${name} -> ${host}`);
    }
  }
  console.log(JSON.stringify({ updated }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
