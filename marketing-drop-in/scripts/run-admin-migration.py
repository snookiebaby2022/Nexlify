#!/usr/bin/env python3
import sqlite3
from pathlib import Path

ROOT = Path("/var/www/nexlify")
db = ROOT / "data" / "nexlify.db"
if not db.is_file():
    db = ROOT / "prisma" / "dev.db"

conn = sqlite3.connect(db)
cur = conn.cursor()

def col_exists(table: str, column: str) -> bool:
    cur.execute(f'PRAGMA table_info("{table}")')
    return any(r[1] == column for r in cur.fetchall())

stmts = [
    ("User", "trialBypass", "ALTER TABLE User ADD COLUMN trialBypass BOOLEAN NOT NULL DEFAULT 0"),
    ("User", "utmSource", "ALTER TABLE User ADD COLUMN utmSource TEXT"),
    ("User", "utmMedium", "ALTER TABLE User ADD COLUMN utmMedium TEXT"),
    ("User", "utmCampaign", "ALTER TABLE User ADD COLUMN utmCampaign TEXT"),
    ("Order", "utmSource", 'ALTER TABLE "Order" ADD COLUMN utmSource TEXT'),
    ("Order", "utmMedium", 'ALTER TABLE "Order" ADD COLUMN utmMedium TEXT'),
    ("Order", "utmCampaign", 'ALTER TABLE "Order" ADD COLUMN utmCampaign TEXT'),
]

for table, col, sql in stmts:
    if col_exists(table, col):
        print(f"Skip {table}.{col}")
    else:
        cur.execute(sql)
        print(f"Added {table}.{col}")

conn.commit()
conn.close()
print("Migration complete")
