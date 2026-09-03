#!/usr/bin/env bash
# Keep nginx retrying the panel port and show a short hold page on UI 502/503.
# Never attaches the hold page to /live/, /timeshift/, /movie/, or /series/.
set -euo pipefail

UPSTREAM="${NEXLIFY_NGINX_UPSTREAM:-/etc/nginx/conf.d/nexlify-upstream.conf}"
HOLD_DIR="/var/www/nexlify-updating"
HOLD_HTML="$HOLD_DIR/updating.html"

if [ "$(id -u)" -ne 0 ]; then
  echo "[nginx-hold] skip (not root)"
  exit 0
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo "[nginx-hold] skip (no nginx)"
  exit 0
fi

mkdir -p "$HOLD_DIR"
cat > "$HOLD_HTML" <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel restarting</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0b1220; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  .card { max-width: 28rem; padding: 1.5rem 1.75rem; border: 1px solid #1e3a5f; border-radius: 12px; background: #0f172a; }
  h1 { font-size: 1.15rem; margin: 0 0 .5rem; }
  p { margin: 0; color: #94a3b8; line-height: 1.5; }
</style>
</head>
<body>
<div class="card">
  <h1>Panel is restarting</h1>
  <p>This page refreshes automatically. Live TV is not affected. Wait about 30–60 seconds, then try again.</p>
</div>
</body>
</html>
HTML

if [ -f "$UPSTREAM" ] && grep -q 'upstream nexlify_panel' "$UPSTREAM"; then
  python3 - "$UPSTREAM" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding="utf-8", errors="replace")
orig = text
def add_fails(m):
    prefix, rest = m.group(1), m.group(2)
    if "max_fails=" in rest:
        return m.group(0)
    return prefix + " max_fails=0 fail_timeout=1s;"
text = re.sub(r"(server\s+127\.0\.0\.1:\d+)([^;]*);", add_fails, text, count=1)
if text != orig:
    p.write_text(text, encoding="utf-8")
    print("[nginx-hold] patched upstream max_fails=0")
else:
    print("[nginx-hold] upstream already hardened")
PY
fi

python3 - <<'PY'
from pathlib import Path
import re

HOLD = """
        proxy_connect_timeout 3s;
        proxy_intercept_errors on;
        error_page 502 503 504 =503 @nexlify_panel_hold;
"""
NAMED = """
    location @nexlify_panel_hold {
        default_type text/html;
        root /var/www/nexlify-updating;
        try_files /updating.html =503;
    }
"""

roots = [Path("/etc/nginx/sites-enabled"), Path("/etc/nginx/conf.d")]
changed = 0
for root in roots:
    if not root.exists():
        continue
    for path in root.glob("*.conf"):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "proxy_pass http://nexlify_panel" not in text:
            continue
        orig = text
        # Only inject into location / blocks that proxy the panel UI.
        def inject_loc(m):
            block = m.group(0)
            if "proxy_pass http://nexlify_panel" not in block:
                return block
            if "@nexlify_panel_hold" in block:
                return block
            return block[:-1] + HOLD + "}"

        text = re.sub(
            r"location\s+=?\s*/\s*\{(?:[^{}]|\{[^{}]*\})*\}",
            inject_loc,
            text,
        )
        if "@nexlify_panel_hold" not in text:
            continue
        if "location @nexlify_panel_hold" not in text:
            # Insert named location before the last closing brace of the first server that has the hold.
            idx = text.rfind("}")
            if idx != -1:
                text = text[:idx] + NAMED + "\n" + text[idx:]
        if text != orig:
            path.write_text(text, encoding="utf-8")
            changed += 1
            print(f"[nginx-hold] patched {path}")
print(f"[nginx-hold] files changed={changed}")
PY

if nginx -t >/tmp/nexlify-nginx-hold.test 2>&1; then
  systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
  echo "[nginx-hold] nginx reload OK"
else
  echo "[nginx-hold] nginx -t failed — leaving config; not reloading" >&2
  cat /tmp/nexlify-nginx-hold.test >&2 || true
  exit 0
fi
