#!/bin/bash
set -euo pipefail
set -a
. /opt/nexlify-panel/.env
set +a
python3 - <<'PY'
import os, subprocess, json, urllib.parse
url = os.environ.get("DATABASE_URL")
sql = r'''
SELECT l.username, l.password, s."xtreamNum"
FROM "LiveConnection" c
JOIN "Line" l ON l.id = c."lineId"
JOIN "Stream" s ON s.id = c."streamId"
WHERE c."endedAt" IS NULL AND s."xtreamNum" IS NOT NULL
ORDER BY c."startedAt" DESC
LIMIT 1;
'''
out = subprocess.check_output(["psql", url, "-t", "-A", "-F", "|", "-c", sql], text=True).strip()
if not out:
    sql = r'''
SELECT l.username, l.password, s."xtreamNum"
FROM "Line" l
JOIN "LineBouquet" lb ON lb."lineId" = l.id
JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
JOIN "Stream" s ON s.id = bs."streamId"
WHERE l.username = '_smoke_test' AND s.type = 'LIVE' AND s."isActive" = true AND s."xtreamNum" IS NOT NULL
LIMIT 1;
'''
    out = subprocess.check_output(["psql", url, "-t", "-A", "-F", "|", "-c", sql], text=True).strip()
if not out:
    print("NO_STREAM")
    raise SystemExit(1)
user, pw, num = out.split("|", 2)
path = f"/live/{urllib.parse.quote(user, safe='')}/{urllib.parse.quote(pw, safe='')}/{num}.ts"
def probe(host):
    cmd = ["curl","-sS","-m","12","-A","VLC/3.0.20","-o","/tmp/live-probe.bin","-w","http=%{http_code} type=%{content_type} bytes=%{size_download} redir=%{redirect_url}","http://"+host+path]
    r = subprocess.check_output(cmd, text=True)
    head = open("/tmp/live-probe.bin","rb").read(8)
    kind = "mpegts" if head[:1]==b"\x47" else head[:20]
    print(host, r, "head", kind)

print("active_line", "yes" if True else "no")
probe("127.0.0.1")
probe("127.0.0.1:8080")
probe("209.237.141.15:8080")
PY
echo ---RECENT200---
awk '$7 ~ /\/live\// && $4 ~ /14:4[4-9]/ && $9==200 {n++} END{print n+0}' /var/log/nginx/access.log
awk '$7 ~ /\/live\// && $4 ~ /14:4[4-9]/ {c[$9]++} END{for (k in c) print c[k], k}' /var/log/nginx/access.log | sort -nr | head
