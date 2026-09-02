#!/bin/bash
set +e
echo '=== nginx ssl cert files ==='
grep -n ssl_certificate /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/* /etc/nginx/nginx.conf 2>/dev/null | head -40
echo
echo '=== cert for SNI darkcdn.store ==='
echo | openssl s_client -servername darkcdn.store -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null
echo
echo '=== cert for SNI 45.88.138.18 ==='
echo | openssl s_client -servername 45.88.138.18 -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null
echo
echo '=== letsencrypt / nexlify certs ==='
ls -l /etc/letsencrypt/live 2>/dev/null
ls -l /etc/nginx/ssl/nexlify-panel 2>/dev/null | head
echo
echo '=== curl https darkcdn.store player_api (insecure vs verify) ==='
UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'
echo -n 'verify: '; curl -sS -o /dev/null -w '%{http_code} err:%{errormsg}\n' --max-time 8 -A "$UA" 'https://darkcdn.store/player_api.php?username=x&password=y' 2>&1 | tail -1
echo -n 'insecure: '; curl -skS -o /tmp/pa.json -w '%{http_code}\n' --max-time 8 -A "$UA" 'https://darkcdn.store/player_api.php?username=x&password=y'
head -c 200 /tmp/pa.json; echo
echo
echo '=== http darkcdn.store login shape ==='
curl -sS --max-time 8 -A "$UA" -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php?username=x&password=y' | python3 -c 'import sys,json
d=json.load(sys.stdin)
print({k:d.get("user_info",{}).get(k) for k in ("auth","status","message")})
si=d.get("server_info") or {}
print("server", {k:si.get(k) for k in ("url","port","https_port","server_protocol")})'
echo
echo '=== UA restricted lines ==='
cd /opt/nexlify-panel
node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const lines=await p.line.findMany({
    select:{ username:true, allowedUserAgents:true, disallowedUserAgents:true, status:true }
  });
  const nonempty=lines.filter(l=>{
    const a=(l.allowedUserAgents||"").trim();
    const d=(l.disallowedUserAgents||"").trim();
    return (a && a!=="[]" && a!=="null") || (d && d!=="[]" && d!=="null");
  });
  console.log("restricted", nonempty.length);
  for (const l of nonempty.slice(0,50)) console.log(JSON.stringify(l));
  await p.$disconnect();
})().catch(e=>{console.error(e.message); process.exit(1);});
'
