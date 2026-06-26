#!/usr/bin/env bash
# Quote unquoted .env values that contain spaces (prevents "command not found" on source).
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
ENV="$PANEL_DIR/.env"
[ -f "$ENV" ] || exit 0

python3 <<PY
from pathlib import Path
p = Path("$ENV")
lines = p.read_text().splitlines()
out = []
for line in lines:
    if not line or line.lstrip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    k, v = line.split("=", 1)
    v = v.strip()
    if " " in v and not ((v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'"))):
        v = '"' + v.replace('"', '\\"') + '"'
    out.append(f"{k}={v}")
p.write_text("\n".join(out) + "\n")
print("Fixed .env quoting in", p)
PY
