#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const U = creds.u;
  const P = encodeURIComponent(creds.p);
  const SID = creds.streamId;
  const p = new (require("@prisma/client").PrismaClient)();
  const s = await get10gbsServer(p);
  await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
    const r = await sshExec(
      c,
      `curl -s -m 30 -D /tmp/h.txt -o /tmp/b.bin -A 'VLC/3.0.20 LibVLC/3.0.20' 'http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts'; echo '---headers---'; head -20 /tmp/h.txt; echo '---body---'; wc -c /tmp/b.bin; xxd /tmp/b.bin | head -3`
    );
    console.log(r.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
