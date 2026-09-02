#!/usr/bin/env python3
import os, re, subprocess

dump = "/tmp/xui-catalog-only.sql"
counts = {"streams": 0, "streams_categories": 0, "bouquets": 0, "streams_series": 0, "streams_episodes": 0}
current = None
start_re = re.compile(
    br"INSERT INTO [`']?(\w+)",
    re.I,
)
with open(dump, "rb") as f:
    leftover = b""
    while True:
        chunk = f.read(4 * 1024 * 1024)
        data = leftover + (chunk or b"")
        if not data:
            break
        matches = list(start_re.finditer(data))
        if not matches:
            if current in counts:
                counts[current] += data.count(b"),(")
            leftover = b"" if not chunk else data[-32:]
            if not chunk:
                break
            continue
        pre = data[: matches[0].start()]
        if current in counts and pre:
            counts[current] += pre.count(b"),(")
        for i, m in enumerate(matches):
            name = m.group(1).decode("ascii", "replace").lower()
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else (len(data) if not chunk else None)
            if end is None:
                leftover = data[start:]
                current = name
                break
            stmt = data[start:end]
            leftover = b""
            current = name
            if name in counts:
                # values tuples
                counts[name] += stmt.count(b"),(") + (1 if b"VALUES" in stmt.upper() else 0)
        if not chunk:
            if leftover and current in counts:
                counts[current] += leftover.count(b"),(")
            break

print("DUMP_ROWS", counts)

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
 (SELECT count(*) FROM "BouquetStream") AS bouquet_links
;"""
os.environ["PGPASSWORD"] = pw
out = subprocess.check_output(
    ["psql", "-h", host, "-p", port, "-U", user, "-d", db, "-t", "-A", "-F", "|", "-c", sql],
    text=True,
)
print("PANEL", out.strip())
