#!/usr/bin/env bash
# Cut over Main nginx: Xtream PHP files + live-auth → PHP-FPM; keep admin→Next, media→classic-lb.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SNIPPET=/etc/nginx/snippets/nexlify-panel-php-xtream.conf

if [ ! -f "$SNIPPET" ]; then
  echo "Missing $SNIPPET — run install.sh first" >&2
  exit 1
fi

# Refresh snippet from repo copy if present
if [ -f "$ROOT/nginx-panel-xtream.conf" ]; then
  SOCK="$(ls /run/php/php*-fpm-panel.sock 2>/dev/null | head -1 || true)"
  if [ -z "$SOCK" ]; then
    SOCK="$(ls /run/php/php*-fpm.sock 2>/dev/null | head -1 || true)"
  fi
  sed -e "s|unix:/run/php/php8.4-fpm-panel.sock|unix:${SOCK}|g" \
      "$ROOT/nginx-panel-xtream.conf" > "$SNIPPET"
fi

# Panel nginx confs are often immutable (chattr +i) on Main.
for f in /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf; do
  [ -f "$f" ] && chattr -i "$f" 2>/dev/null || true
done

python3 - <<'PY'
import re
from pathlib import Path

INCLUDE = "    include /etc/nginx/snippets/nexlify-panel-php-xtream.conf;\n"

# Remove old Xtream→Next proxy blocks; insert PHP include before media or after server_name.
API_RE = re.compile(
    r"(?ms)^    location ~ \^/\(player_api\\.php\|panel_api\\.php\|get\\.php\|xmltv\\.php\|c/\|stalker_portal/\) \{\n.*?^    \}\n"
)
XMLTV_RE = re.compile(r"(?ms)^    location = /xmltv\.php \{\n.*?^    \}\n")
LIVEAUTH_RE = re.compile(
    r"(?ms)^    location (= |~ )?/?api/internal/live-auth[^\n]*\{\n.*?^    \}\n"
)
# Also catch proxy of /api/ to Next that would steal live-auth — we add exact location which wins.

PANEL_API = """    # Remaining Xtream-ish paths still on Next (MAG / stalker)
    location ~ ^/(c/|stalker_portal/) {
        proxy_pass http://127.0.0.1:13000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }
"""

for p in [
    Path("/etc/nginx/conf.d/nexlify-panel-http.conf"),
    Path("/etc/nginx/conf.d/nexlify-panel-https.conf"),
]:
    if not p.exists():
        print(f"skip (missing) {p}")
        continue
    t = p.read_text()
    # Strip prior PHP include (idempotent)
    t = re.sub(r"(?m)^    include /etc/nginx/snippets/nexlify-panel-php-xtream\.conf;\n", "", t)
    t = API_RE.sub("", t)
    t = XMLTV_RE.sub("", t)
    # Insert include + leftover Next paths after first listen / server_name block end marker:
    # Prefer before media location.
    media = re.search(
        r"(?m)^    location ~ \^/\(live\|timeshift\|movie\|series\)/",
        t,
    )
    insert = INCLUDE + "\n" + PANEL_API + "\n"
    if media:
        pos = media.start()
        t = t[:pos] + insert + t[pos:]
    else:
        # After opening server {
        t2, n = re.subn(r"(?m)^(server \{[^\n]*\n)", r"\1" + insert, t, count=1)
        if n:
            t = t2
        else:
            t = insert + t
    p.write_text(t)
    print("cutover wrote", p)
PY

# Expand media proxy to include XUI token short paths /play/ and /auth/
python3 - <<'PY'
from pathlib import Path
old = "location ~ ^/(live|timeshift|movie|series)/ {"
new = "location ~ ^/(live|timeshift|movie|series|play|auth)/ {"
for p in [
    Path("/etc/nginx/conf.d/nexlify-panel-http.conf"),
    Path("/etc/nginx/conf.d/nexlify-panel-https.conf"),
]:
    if not p.exists():
        continue
    t = p.read_text()
    if new in t:
        print("media_paths_already", p)
    elif old in t:
        p.write_text(t.replace(old, new, 1))
        print("media_paths_ok", p)
    else:
        print("media_paths_skip", p)
PY

nginx -t
systemctl reload nginx || systemctl restart nginx

# Re-lock panel confs if lock-live-routing convention is in use
for f in /etc/nginx/conf.d/nexlify-panel-http.conf /etc/nginx/conf.d/nexlify-panel-https.conf; do
  [ -f "$f" ] && chattr +i "$f" 2>/dev/null || true
done

echo "CUTOVER_OK snippet=$SNIPPET"
curl -fsS -m 5 http://127.0.0.1/panel-php/health || curl -fsS -m 5 http://127.0.0.1:80/panel-php/health || true
echo

# Point classic-lb live-auth at Main (PHP) when co-located
if [ -x "$ROOT/point-classic-lb-auth.sh" ] && [ -f /etc/nexlify-lb/lb.env ]; then
  bash "$ROOT/point-classic-lb-auth.sh" || true
fi
