#!/usr/bin/env bash
set -euo pipefail
PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
SCHEMA="$PANEL/prisma/schema.prisma"
export SCHEMA

python3 << 'PY'
import os
from pathlib import Path
p = Path(os.environ["SCHEMA"])
text = p.read_text()
changed = False

if "canWatchAdult" not in text:
    anchor = "  blockedCountries String?\n  forcedServerId"
    insert = """  blockedCountries String?
  /// Comma-separated User-Agent substrings. Empty = no allow-list restriction.
  allowedUserAgents String?
  /// Comma-separated User-Agent substrings to block.
  disallowedUserAgents String?
  /// When false, adult-tagged streams are blocked for this line.
  canWatchAdult    Boolean    @default(true)
  forcedServerId"""
    if anchor not in text:
        raise SystemExit("Could not find Line model anchor for restrictions")
    text = text.replace(anchor, insert, 1)
    changed = True

if "isAdult" not in text:
    anchor = "  isRadio            Boolean    @default(false)\n  agentStartCmd"
    insert = """  isRadio            Boolean    @default(false)
  isAdult            Boolean    @default(false)
  agentStartCmd"""
    if anchor not in text:
        raise SystemExit("Could not find Stream model anchor for isAdult")
    text = text.replace(anchor, insert, 1)
    changed = True

if changed:
    p.write_text(text)
    print("schema.prisma updated with line restrictions")
else:
    print("schema.prisma already has line restriction fields")
PY
