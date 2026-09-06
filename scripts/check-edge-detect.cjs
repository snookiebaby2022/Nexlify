#!/usr/bin/env node
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  const net = s.server.panelSettings && s.server.panelSettings.network;
  console.log("stored_iface=", net?.interfaceName || "(none)");
  console.log("stored_gateway=", net?.gateway || "(none)");
  console.log("stored_privateIp=", s.server.privateIp || "(none)");
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `IFACE=$(awk '$2=="00000000"{print $1;exit}' /proc/net/route); GWHEX=$(awk -v i="$IFACE" '$1==i && $2=="00000000"{print $3;exit}' /proc/net/route); GW=""; if [ -n "$GWHEX" ] && [ \${#GWHEX} -eq 8 ]; then GW=$(printf "%d.%d.%d.%d" 0x\${GWHEX:6:2} 0x\${GWHEX:4:2} 0x\${GWHEX:2:2} 0x\${GWHEX:0:2}); fi; PRIV=$(ip -4 -o addr show dev "$IFACE" | awk '{print $4}' | cut -d/ -f1 | head -1); echo DETECT_IFACE=$IFACE; echo DETECT_GW=$GW; echo DETECT_PRIV=$PRIV; echo LINK=$(cat /sys/class/net/$IFACE/speed 2>/dev/null); ip -4 route show default`
    );
    console.log(r.stdout.trim());
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
