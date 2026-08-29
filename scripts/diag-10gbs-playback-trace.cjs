#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
      encoding: "utf8",
    }).trim()
  );
  const uri = `/live/${creds.u}/${encodeURIComponent(creds.p)}/1476023810.ts`;
  const p = new (require("@prisma/client").PrismaClient)();
  const { server, host, port, user, password } = await get10gbsServer(p);
  const panel = process.env.PANEL_PUBLIC_HOST || "45.88.138.18";
  const panelPort = process.env.PORT || "13000";
  const token = server.agentToken || "";

  await withSshClient({ host, port, user, password }, async (c) => {
    const r1 = await sshExec(
      c,
      `curl -sS -m 10 -D - -o /dev/null -H 'Authorization: Bearer ${token}' -H 'x-nexlify-agent-server-id: ${server.id}' -H 'x-original-uri: ${uri}' -H 'x-original-method: GET' -H 'user-agent: VLC/3.0.20' 'http://${panel}:${panelPort}/api/internal/live-auth' | head -30`
    );
    console.log("=== live-auth from 10gbs ===\n" + r1.stdout);

    const upMatch = String(r1.stdout).match(/x-nexlify-upstream:\s*(.+)/i);
    const upstream = upMatch?.[1]?.trim();
    if (upstream) {
      const inline = `
const https=require('https');const http=require('http');
const url=${JSON.stringify(upstream)};
function go(u,r){const p=new URL(u);const lib=p.protocol==='https:'?https:http;
const req=lib.request({hostname:p.hostname,port:+p.port||(p.protocol==='https:'?443:80),method:'GET',path:p.pathname+p.search,headers:{'User-Agent':'VLC/3.0.20 LibVLC/3.0.20',Accept:'*/*',Connection:'close','Icy-MetaData':'0',Host:p.host},timeout:15000,agent:false,rejectUnauthorized:false},res=>{
  const loc=res.headers.location;
  if(res.statusCode>=300&&res.statusCode<400&&loc&&r<8){res.resume();return go(new URL(loc,u).toString(),r+1);}
  let n=0;const c=[];res.on('data',d=>{c.push(d);n+=d.length;if(n>65536)req.destroy();});
  res.on('close',()=>{const b=Buffer.concat(c);console.log(JSON.stringify({status:res.statusCode,ct:res.headers['content-type'],bytes:b.length,ts:b[0]===0x47}));});
});
req.on('error',e=>console.log(JSON.stringify({error:e.message})));req.on('timeout',()=>{req.destroy();console.log(JSON.stringify({error:'timeout'}));});req.end();}
go(url,0);`;
      const r2 = await sshExec(c, `node -e ${JSON.stringify(inline)}`);
      console.log("=== upstream edge-style ===\n" + r2.stdout.trim());
    }

    const r3 = await sshExec(
      c,
      `curl -sS -m 25 -D /tmp/h.txt -o /tmp/b.bin -A 'VLC/3.0.20' 'http://127.0.0.1:8080${uri}'; echo '---edge---'; head -15 /tmp/h.txt; wc -c /tmp/b.bin`
    );
    console.log("=== edge local ===\n" + r3.stdout);
  });
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
