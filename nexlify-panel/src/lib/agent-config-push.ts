import { prisma } from "@/lib/prisma";
import { bumpConfigRevision } from "@/lib/stream-agent";

export async function queueApplyConfigAllServers() {
  const servers = await prisma.streamServer.findMany({
    where: { agentToken: { not: null }, isActive: true },
    select: { id: true },
  });
  let n = 0;
  for (const s of servers) {
    await bumpConfigRevision(s.id);
    n++;
  }
  return n;
}
