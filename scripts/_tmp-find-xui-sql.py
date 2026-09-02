#!/usr/bin/env python3
import os, re, glob

paths = [
    "/tmp/nexlify-migrate-1787751507310-mamo8hx6p3n.sql",
    "/tmp/nexlify-migrate-1787731771972-h9rla1djoec.sql",
]
extra = []
for root, dirs, files in os.walk("/opt/nexlify-panel/data"):
    for n in files:
        if n.endswith((".sql", ".sql.gz", ".gz")):
            extra.append(os.path.join(root, n))
print("DATA_SQL", extra[:40])

for p in paths:
    print("FILE", p, os.path.getsize(p))
    with open(p, "rb") as f:
        chunk = f.read(12 * 1024 * 1024).decode("utf-8", "replace")
    print("HEAD", chunk[:350].replace("\n", " | "))
    tables = sorted(set(re.findall(r"CREATE TABLE [`']?(\w+)", chunk, re.I)))
    inserts = sorted(set(re.findall(r"INSERT INTO [`']?(\w+)", chunk, re.I)))
    print("CREATE", tables[:100])
    print("INSERT", inserts[:100])
    print("---")
