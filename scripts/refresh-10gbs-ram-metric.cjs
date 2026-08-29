#!/usr/bin/env node
/** Push updated host-metrics + stream-agent to 10gbs and refresh stored RAM reading. */
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const fs = require("fs");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const AGENT_AWK =
  "awk '/MemTotal/{t=$2} /AnonPages/{ap=$2} /MemAvailable/{av=$2} END { if (t>0 && ap>0) { p=int((ap/t)*100+0.5) } else if (t>0 && av>0) { p=int(((t-av)/t)*100+0.5) } else { p=0 }; if (p<0) p=0; if (p>100) p=100; print p }'";

(async () => {
  const agentPath = require("path").join(__dirname, "nexlify-stream-agent.sh");
  let agent = fs.readFileSync(agentPath, "utf8");
  const p = new (require("@prisma/client").PrismaClient)();
  const creds = await get10gbsServer(p);
  await withSshClient(creds, async (c) => {
    const b64 = Buffer.from(agent, "utf8").toString("base64");
    await sshExec(c, `echo '${b64}' | base64 -d > /opt/nexlify-stream-agent/nexlify-stream-agent.sh && chmod +x /opt/nexlify-stream-agent/nexlify-stream-agent.sh 2>/dev/null || mkdir -p /opt/nexlify-stream-agent && echo '${b64}' | base64 -d > /opt/nexlify-stream-agent/nexlify-stream-agent.sh && chmod +x /opt/nexlify-stream-agent/nexlify-stream-agent.sh`);
    const sample = await sshExec(
      c,
      `${AGENT_AWK} /proc/meminfo; echo; free -h | head -2; sync; echo 3 > /proc/sys/vm/drop_caches; ${AGENT_AWK} /proc/meminfo; echo; free -h | head -2`
    );
    console.log("[10gbs] RAM pct (AnonPages-based):");
    console.log(sample.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
