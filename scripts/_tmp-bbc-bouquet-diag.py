#!/usr/bin/env python3
import os, re, subprocess

env = open("/opt/nexlify-panel/.env").read()
url = None
for line in env.splitlines():
    if line.startswith("DATABASE_URL="):
        url = line.split("=", 1)[1].strip().strip('"').strip("'")
        break
m = re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d*)/([^?]+)", url or "")
user, pw, host, port, db = m.groups()
port = port or "5432"
os.environ["PGPASSWORD"] = pw

def q(sql):
    return subprocess.check_output(
        ["psql", "-h", host, "-p", port, "-U", user, "-d", db, "-c", sql],
        text=True,
    )

print("=== BBC One ===")
print(q("""
SELECT s.name, s.type, s.\"isActive\", c.name AS folder,
  (SELECT count(*) FROM \"BouquetStream\" bs WHERE bs.\"streamId\"=s.id) AS bouquets,
  (SELECT string_agg(b.name, ', ' ORDER BY b.name) FROM \"BouquetStream\" bs JOIN \"Bouquet\" b ON b.id=bs.\"bouquetId\" WHERE bs.\"streamId\"=s.id) AS in_bouquets
FROM \"Stream\" s
LEFT JOIN \"Category\" c ON c.id=s.\"categoryId\"
WHERE s.name ILIKE '%BBC One%' AND s.type='LIVE'
ORDER BY s.name
LIMIT 40;
"""))

print("=== orphans by type ===")
print(q("""
SELECT s.type, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM \"BouquetStream\" bs WHERE bs.\"streamId\"=s.id)) AS orphan,
       count(*) AS total
FROM \"Stream\" s
WHERE s.\"isActive\"=true
GROUP BY s.type
ORDER BY s.type;
"""))

print("=== live orphan folders ===")
print(q("""
SELECT COALESCE(c.name,'(none)') AS folder, count(*) 
FROM \"Stream\" s
LEFT JOIN \"Category\" c ON c.id=s.\"categoryId\"
WHERE s.type='LIVE' AND s.\"isActive\"=true
  AND NOT EXISTS (SELECT 1 FROM \"BouquetStream\" bs WHERE bs.\"streamId\"=s.id)
GROUP BY 1
ORDER BY 2 DESC
LIMIT 40;
"""))

print("=== bouquets ===")
print(q('SELECT name, (SELECT count(*) FROM \"BouquetStream\" bs WHERE bs.\"bouquetId\"=b.id) n FROM \"Bouquet\" b ORDER BY name;'))
