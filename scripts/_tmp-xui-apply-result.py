#!/usr/bin/env python3
import json, os, re, subprocess

d = json.load(open("/tmp/nexlify-migrate-job.json"))
print("status", d.get("status"))
print("message", d.get("message"))
print("error", d.get("error"))
res = d.get("result") or {}
print("RESULT_KEYS", list(res.keys()) if isinstance(res, dict) else type(res))
interesting = [
    "bouquets", "streams", "categories", "lines", "warnings"
]
if isinstance(res, dict):
    for k in interesting:
        print(k, json.dumps(res.get(k), default=str)[:1500])
    warns = res.get("warnings") or []
    print("warn_count", len(warns))
    for w in warns[:25]:
        print("W", w)

env = open("/opt/nexlify-panel/.env").read()
url = None
for line in env.splitlines():
    if line.startswith("DATABASE_URL="):
        url = line.split("=", 1)[1].strip().strip('"').strip("'")
        break
m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d*)/([^?]+)", url or "")
user, pw, host, port, db = m.groups()
port = port or "5432"
sql = """SELECT
 (SELECT count(*) FROM "Stream") AS streams,
 (SELECT count(*) FROM "Stream" WHERE type='LIVE') AS live,
 (SELECT count(*) FROM "Category") AS cats,
 (SELECT count(*) FROM "Bouquet") AS bouquets,
 (SELECT count(*) FROM "BouquetStream") AS bouquet_links;
"""
os.environ["PGPASSWORD"] = pw
out = subprocess.check_output(
    ["psql", "-h", host, "-p", port, "-U", user, "-d", db, "-t", "-A", "-F", "|", "-c", sql],
    text=True,
)
print("PANEL", out.strip())

sql2 = """SELECT name, (SELECT count(*) FROM "BouquetStream" bs WHERE bs."bouquetId"=b.id) AS n
FROM "Bouquet" b ORDER BY b."sortOrder", b.name;"""
out2 = subprocess.check_output(
    ["psql", "-h", host, "-p", port, "-U", user, "-d", db, "-c", sql2],
    text=True,
)
print("BOUQUETS")
print(out2)
