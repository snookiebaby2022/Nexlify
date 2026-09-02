#!/bin/bash
set +e
echo '=== rebuild ==='
tail -6 /tmp/nexlify-lg-smarters-rebuild.log 2>/dev/null
grep -E 'Done v2.0.62|Failed to compile' /tmp/nexlify-lg-smarters-rebuild.log 2>/dev/null | tail -3
echo
echo '=== health / https force ==='
curl -sS --max-time 8 http://127.0.0.1:13000/api/health
echo
grep -E '^(PANEL_FORCE_HTTPS|PANEL_FULL_SSL|NEXT_PUBLIC_SERVER_URL|PANEL_PRIMARY_DOMAIN|PANEL_ASSUME_PROXY_SSL)=' /opt/nexlify-panel/.env
echo
echo '=== Web0S player_api status (login vs action) ==='
python3 - <<'PY'
from collections import Counter
import re
c_login=Counter(); c_act=Counter(); samples=[]
for path in ["/var/log/nginx/access.log"]:
    try:
        f=open(path, errors="replace")
    except FileNotFoundError:
        continue
    for line in f:
        if "Web0S" not in line or "player_api.php" not in line:
            continue
        m=re.search(r'"[A-Z]+ ([^ ]+) HTTP/[^"]+" (\d+)', line)
        if not m:
            continue
        url, code = m.group(1), m.group(2)
        if "action=" in url:
            c_act[code]+=1
        else:
            c_login[code]+=1
            if len(samples)<8:
                samples.append((code, url[:120], line.split('"')[-2][:80] if line.count('"')>2 else ""))
print("login (no action)", dict(c_login))
print("with action", dict(c_act))
print("sample logins:")
for s in samples:
    print(s)
PY
echo
echo '=== lines with UA restrictions ==='
cd /opt/nexlify-panel
node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const lines=await p.line.findMany({
    where:{ OR:[{allowedUserAgents:{not:null}},{disallowedUserAgents:{not:null}}] },
    select:{ username:true, isActive:true, allowedUserAgents:true, disallowedUserAgents:true, maxConnections:true }
  });
  const nonempty=lines.filter(l=>(l.allowedUserAgents&&l.allowedUserAgents!=="[]")||(l.disallowedUserAgents&&l.disallowedUserAgents!=="[]"));
  console.log("restricted", nonempty.length, "of", lines.length);
  for (const l of nonempty.slice(0,40)) console.log(JSON.stringify(l));
  await p.$disconnect();
})().catch(e=>{console.error(e); process.exit(1);});
'
echo
echo '=== public player_api headers via 80 and 443 ==='
UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'
curl -sSI --max-time 8 -A "$UA" -H 'Host: darkcdn.store' http://127.0.0.1/player_api.php | tr -d '\r' | grep -iE 'HTTP/|location|content-type' | head -8
echo '--- https ---'
curl -skSI --max-time 8 -A "$UA" https://127.0.0.1/player_api.php -H 'Host: darkcdn.store' | tr -d '\r' | grep -iE 'HTTP/|location|content-type' | head -8
echo '--- cert ---'
echo | openssl s_client -servername darkcdn.store -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName 2>/dev/null | head -20
