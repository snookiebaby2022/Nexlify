import { prisma } from "@/lib/prisma";
import { sortServersMainFirst } from "@/lib/ensure-main-server-online";
import { publicStreamServer } from "@/lib/server-public";

export async function listAdminServers() {
  const servers = await prisma.streamServer.findMany({
    include: {
      proxy: true,
      _count: { select: { streams: true, lbSessions: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return sortServersMainFirst(servers).map(publicStreamServer);
}

export async function listAdminServersLite() {
  const servers = await prisma.streamServer.findMany({
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return sortServersMainFirst(servers);
}
