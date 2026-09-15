#!/usr/bin/env node
require("./load-env.cjs").loadEnv();
const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");
(async () => {
  const p = new PrismaClient();
  const s = await get10gbsServer(p);
  console.log("ssh", s.host, s.port, s.user);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `hostname; ip -br link; ls /sys/class/net; for i in /sys/class/net/*/speed; do echo \$i=\$(cat \$i 2>/dev/null); done; python3 - <<'PY'
import time
def n(name):
  for line in open("/proc/net/dev"):
    if line.strip().startswith(name+":"):
      c=line.replace(":"," ").split(); return int(c[1]), int(c[9])
  return 0,0
for i in ["eth0","ens3","eno1","enp1s0","ens18"]:
  a=n(i); time.sleep(2); b=n(i)
  if a!=(0,0) or b!=(0,0):
    print(i, "RX", round((b[0]-a[0])*8/2/1e9,3), "TX", round((b[1]-a[1])*8/2/1e9,3), "Gbps")
PY`
    );
    console.log(r.stdout);
    if (r.stderr) console.log("stderr", r.stderr.slice(0, 400));
    console.log("code", r.code);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
