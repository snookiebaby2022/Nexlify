#!/bin/bash
set +e
cd /opt/nexlify-panel
r1=$(awk '/eth0:/{print $2,$10}' /proc/net/dev)
sleep 2
r2=$(awk '/eth0:/{print $2,$10}' /proc/net/dev)
python3 -c "
r1='$r1'.split()
r2='$r2'.split()
rx1,tx1=int(r1[0]),int(r1[1])
rx2,tx2=int(r2[0]),int(r2[1])
dt=2.0
down=(rx2-rx1)*8/dt/1e6
up=(tx2-tx1)*8/dt/1e6
print('eth0 down=%.1f Mbps  up=%.1f Mbps  (2s sample)' % (down, up))
"
node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const s=await p.streamServer.findMany({select:{name:true,host:true,bandwidthMbps:true,maxClients:true,healthStatus:true},orderBy:{sortOrder:"asc"}});
  for (const x of s) console.log(JSON.stringify(x));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1);});
'
