#!/usr/bin/env node
/** Patch 10gbs StreamServer network settings to real NIC (enp45s0). */
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const s = await p.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!s) throw new Error("10gbs not found");
  const settings = s.panelSettings && typeof s.panelSettings === "object" ? { ...s.panelSettings } : {};
  const network = { ...(settings.network || {}) };
  const before = {
    interfaceName: network.interfaceName,
    gateway: network.gateway,
    privateIp: s.privateIp,
  };
  network.interfaceName = "enp45s0";
  network.gateway = "209.237.141.1";
  network.mtu = Number(network.mtu) > 0 ? Number(network.mtu) : 1500;
  if (!network.dnsServers) network.dnsServers = "8.8.8.8\n8.8.4.4";
  settings.network = network;
  await p.streamServer.update({
    where: { id: s.id },
    data: {
      privateIp: null, // public IP lives on enp45s0; don't fake 10.0.0.1
      panelSettings: settings,
      healthMessage: "NIC patched to enp45s0 (10G)",
      lastHealthAt: new Date(),
    },
  });
  const after = await p.streamServer.findUnique({
    where: { id: s.id },
    select: { privateIp: true, panelSettings: true, healthMessage: true },
  });
  console.log(JSON.stringify({ before, after: { privateIp: after.privateIp, network: after.panelSettings?.network, healthMessage: after.healthMessage } }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
