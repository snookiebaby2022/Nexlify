#!/usr/bin/env bash
set -euo pipefail
PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
SCHEMA="$PANEL/prisma/schema.prisma"

python3 << PY
from pathlib import Path
p = Path("$SCHEMA")
text = p.read_text()
changed = False
if "enum LineAuthMode" not in text:
    text = text.replace(
        "enum LineStatus {",
        "enum LineAuthMode {\n  USERNAME_PASSWORD\n  ACTIVE_CODE\n}\n\nenum LineStatus {",
        1,
    )
    changed = True
if "authMode" not in text:
    old = """model Line {
  id              String     @id @default(cuid())
  username        String     @unique
  password        String"""
    new = """model Line {
  id              String     @id @default(cuid())
  username        String     @unique
  password        String
  authMode          LineAuthMode @default(USERNAME_PASSWORD)
  activeCode        String?      @unique"""
    if old not in text:
        raise SystemExit("Could not find Line model anchor in schema.prisma")
    text = text.replace(old, new, 1)
    changed = True
if changed:
    p.write_text(text)
    print("schema.prisma updated")
else:
    print("schema.prisma already has ActiveCode fields")
PY

cd "$PANEL"
npx prisma db push --accept-data-loss
npx prisma generate
