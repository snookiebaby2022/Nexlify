#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess, urllib.parse

def psql(sql):
    r = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", "nexlify", "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("psql_failed", (r.stderr or "")[:200])
        raise SystemExit(1)
    return r.stdout.strip()

out = psql('''
SELECT l.username, l.password, s."xtreamNum"
FROM "LiveConnection" c
JOIN "Line" l ON l.id = c."lineId"
JOIN "Stream" s ON s.id = c."streamId"
WHERE c."lastSeenAt" > NOW() - INTERVAL '3 minutes' AND s."xtreamNum" IS NOT NULL
ORDER BY c."lastSeenAt" DESC
LIMIT 1;
''')
src = "liveconn"
if not out:
    src = "smoke"
    out = psql('''
SELECT l.username, l.password, s."xtreamNum"
FROM "Line" l
JOIN "LineBouquet" lb ON lb."lineId" = l.id
JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
JOIN "Stream" s ON s.id = bs."streamId"
WHERE l.username = '_smoke_test' AND s.type = 'LIVE' AND s."isActive" = true AND s."xtreamNum" IS NOT NULL
LIMIT 1;
''')
if not out:
    print("NO_STREAM")
    raise SystemExit(1)
user, pw, num = out.split("|", 2)
path = f"/live/{urllib.parse.quote(user, safe='')}/{urllib.parse.quote(pw, safe='')}/{num}.ts"
print("source", src, "stream", num)

def probe(host):
    cmd = ["curl","-sS","-m","12","-A","VLC/3.0.20","-o","/tmp/live-probe.bin","-w","http=%{http_code} type=%{content_type} bytes=%{size_download} redir=%{num_redirects}","http://"+host+path]
    r = subprocess.check_output(cmd, text=True)
    head = open("/tmp/live-probe.bin","rb").read(8)
    kind = "mpegts" if head[:1]==b"\x47" else head[:40]
    print(host, r, "head", kind)

probe("127.0.0.1")
probe("127.0.0.1:8080")
probe("209.237.141.15:8080")
PY
echo ---SINCE_RESTART---
awk '$7 ~ /\/live\// && $4 ~ /01\/Sep\/2026:14:4[4-9]/ {c[$9]++} END{for (k in c) print c[k], k}' /var/log/nginx/access.log | sort -nr | head
