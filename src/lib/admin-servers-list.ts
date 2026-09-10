import { prisma } from "@/lib/prisma";
import { cacheGetOrSet } from "@/lib/cache";
import { sortServersMainFirst } from "@/lib/ensure-main-server-online";
import { publicStreamServer } from "@/lib/server-public";

export async function listAdminServers() {
  // _count.streams over ~850k rows is ~80ms; cache so servers page / API stay snappy.
  return cacheGetOrSet("admin:servers:list:v1", 60, async () => {
    const servers = await prisma.streamServer.findMany({
      include: {
        proxy: true,
        _count: { select: { streams: true, lbSessions: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return sortServersMainFirst(servers).map(publicStreamServer);
  });
}

export async function listAdminServersLite() {
  const servers = await prisma.streamServer.findMany({
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return sortServersMainFirst(servers);
}
