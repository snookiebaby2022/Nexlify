#!/usr/bin/env python3
"""Copy marketing-drop-in to nexlify-web. Never touches .env or production data."""
from __future__ import annotations

import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path("/var/www/nexlify")
DROP_IN = Path("/tmp/marketing-full-drop-in")
MIGRATION = ROOT / "scripts" / "migrate-marketing-admin.sql"

# Directories never overwritten from deploy tarball
SKIP_PARTS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".next",
    "src/generated",
    "data",
}

# Files never copied (secrets + local dev)
SKIP_FILE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
}


def should_skip(rel: Path) -> bool:
    if rel.name in SKIP_FILE_NAMES:
        return True
    if any(part in SKIP_PARTS for part in rel.parts):
        return True
    return False


def copy_tree() -> int:
    if not DROP_IN.is_dir():
        print(f"Missing {DROP_IN}", file=sys.stderr)
        return 1
    count = 0
    skipped = 0
    for src in sorted(DROP_IN.rglob("*")):
        if not src.is_file():
            continue
        rel = src.relative_to(DROP_IN)
        if should_skip(rel):
            skipped += 1
            continue
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        count += 1
    print(f"Marketing patch: {count} files installed, {skipped} skipped (env/data/build)")
    return 0


def run_migration() -> None:
    db_path = ROOT / "data" / "nexlify.db"
    if not db_path.is_file():
        db_path = ROOT / "prisma" / "dev.db"
    if not db_path.is_file():
        print(f"No SQLite db found under {ROOT / 'data'} or prisma/, skipping migration")
        return
    if not MIGRATION.is_file():
        print(f"No migration file at {MIGRATION}, skipping")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    def column_exists(table: str, column: str) -> bool:
        cur.execute(f'PRAGMA table_info("{table}")')
        return any(row[1] == column for row in cur.fetchall())

    statements = [
        ("User", "trialBypass", "ALTER TABLE User ADD COLUMN trialBypass BOOLEAN NOT NULL DEFAULT 0"),
        ("User", "utmSource", "ALTER TABLE User ADD COLUMN utmSource TEXT"),
        ("User", "utmMedium", "ALTER TABLE User ADD COLUMN utmMedium TEXT"),
        ("User", "utmCampaign", "ALTER TABLE User ADD COLUMN utmCampaign TEXT"),
        ("Order", "utmSource", 'ALTER TABLE "Order" ADD COLUMN utmSource TEXT'),
        ("Order", "utmMedium", 'ALTER TABLE "Order" ADD COLUMN utmMedium TEXT'),
        ("Order", "utmCampaign", 'ALTER TABLE "Order" ADD COLUMN utmCampaign TEXT'),
        ("Plan", "stripeProductId", "ALTER TABLE Plan ADD COLUMN stripeProductId TEXT"),
    ]

    for table, column, sql in statements:
        if column_exists(table, column):
            print(f"Skip {table}.{column} (exists)")
            continue
        try:
            cur.execute(sql)
            print(f"Added {table}.{column}")
        except sqlite3.OperationalError as e:
            print(f"Migration note {table}.{column}: {e}")

    conn.commit()
    conn.close()
    print("Admin migration complete")


def prisma_generate() -> None:
    generated = ROOT / "src" / "generated" / "prisma"
    if generated.is_dir():
        shutil.rmtree(generated)
    print("Running prisma generate (pre-build)…")
    result = subprocess.run(["npx", "prisma", "generate"], cwd=ROOT, check=False)
    client = generated / "client.ts"
    engine = list(generated.glob("libquery_engine*.node")) if generated.is_dir() else []
    if result.returncode != 0 or not client.is_file():
        print("ERROR: prisma generate failed", file=sys.stderr)
        raise SystemExit(1)
    if "findMany: async (_args" in client.read_text(encoding="utf-8", errors="replace"):
        print("ERROR: stub Prisma client detected after generate", file=sys.stderr)
        raise SystemExit(1)
    if not engine:
        print("ERROR: Prisma query engine missing after generate", file=sys.stderr)
        raise SystemExit(1)
    print(f"Prisma client OK ({client.stat().st_size} bytes, engine present)")


def main() -> int:
    rc = copy_tree()
    if rc != 0:
        return rc
    run_migration()
    prisma_generate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
