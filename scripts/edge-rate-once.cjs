#!/usr/bin/env node
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PY = `import time
IFACE='enp45s0'
def n():
  for line in open('/proc/net/dev'):
    if line.strip().startswith(IFACE+':'):
      c=line.replace(':',' ').split(); return int(c[1]), int(c[9])
  return 0,0
a=n(); time.sleep(3); b=n()
print('iface', IFACE)
print('rx_gbps', round((b[0]-a[0])*8/3/1e9, 3))
print('tx_gbps', round((b[1]-a[1])*8/3/1e9, 3))
print('link', open('/sys/class/net/enp45s0/speed').read().strip())
`;

(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  const b64 = Buffer.from(PY).toString("base64");
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(c, `echo '${b64}' | base64 -d > /tmp/edge_rate.py && python3 /tmp/edge_rate.py && ls -la /tmp/edge_rate.py`);
    console.log("stdout:", r.stdout);
    console.log("stderr:", r.stderr);
    console.log("code:", r.code);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
