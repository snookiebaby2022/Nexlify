#!/bin/bash
cd /opt/nexlify-panel
node --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const providers = await p.streamProvider.findMany({
  where: { isActive: true },
  select: { id: true, name: true, baseUrl: true, isActive: true, _count: { select: { streams: true } } },
  orderBy: { name: "asc" },
});
const liveByProv = await p.stream.groupBy({
  by: ["providerId"],
  where: { type: "LIVE", isRadio: false },
  _count: { _all: true },
});
const ukEnt = await p.category.findFirst({ where: { name: "UK | Entertainment" }, select: { id: true } });
const inEnt = ukEnt ? await p.stream.groupBy({
  by: ["providerId"],
  where: { categoryId: ukEnt.id, type: "LIVE" },
  _count: { _all: true },
}) : [];
const nameOf = Object.fromEntries(providers.map((x) => [x.id, x.name]));
console.log(JSON.stringify({
  providers: providers.map((x) => ({
    id: x.id,
    name: x.name,
    host: (() => { try { return new URL(x.baseUrl.startsWith("http") ? x.baseUrl : "http://"+x.baseUrl).host; } catch { return x.baseUrl.slice(0,40); } })(),
    streams: x._count.streams,
  })),
  liveByProv: liveByProv.map((g) => ({ provider: nameOf[g.providerId] || "(none)", n: g._count._all })),
  entertainmentByProv: inEnt.map((g) => ({ provider: nameOf[g.providerId] || "(none)", n: g._count._all })),
}, null, 2));
await p.$disconnect();
'
