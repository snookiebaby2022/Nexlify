#!/usr/bin/env bash
# Refuse panel media proxy on :80/:443 — Xtream clients must play on the LB (server_info.url).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/live-routing-env.sh"

PANEL_LISTEN="$(nexlify_resolve_panel_listen)"
REMOTE_IP="$(nexlify_remote_edge_ip)"
if [ -z "$REMOTE_IP" ]; then
  REMOTE_IP="your-stream-server"
fi

export NEXLIFY_PATCH_PANEL_LISTEN="$PANEL_LISTEN"
export NEXLIFY_PATCH_REMOTE_IP="$REMOTE_IP"

python3 - <<'PY'
import os
import re
from pathlib import Path

panel_listen = os.environ["NEXLIFY_PATCH_PANEL_LISTEN"]
remote_ip = os.environ["NEXLIFY_PATCH_REMOTE_IP"]

MEDIA = f"""    location ~ ^/(live|timeshift|movie|series)/ {{
        # Panel media proxy DISABLED — prevents panel hairpin / buffering.
        default_type text/plain;
        return 502 'use load balancer {remote_ip} for media';
    }}
"""

API = f"""    location ~ ^/(player_api\\.php|panel_api\\.php|get\\.php|xmltv\\.php|c/|stalker_portal/) {{
        proxy_pass http://127.0.0.1:{panel_listen};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Nexlify-Client-Port $server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
        proxy_buffering off;
        proxy_request_buffering off;
    }}
"""

XMLTV = f"""    location = /xmltv.php {{
        gzip off;
        proxy_pass http://127.0.0.1:{panel_listen};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Nexlify-Client-Port $server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Accept-Encoding "";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }}
"""

for p in [
    Path("/etc/nginx/conf.d/nexlify-panel-http.conf"),
    Path("/etc/nginx/conf.d/nexlify-panel-https.conf"),
]:
    if not p.exists():
        print(f"skip (missing) {p}")
        continue
    t = p.read_text()
    t2, count = re.subn(
        r"(?ms)^    location ~ \^/\(live\|timeshift\|movie\|series\)/ \{\n.*?^    \}\n",
        MEDIA,
        t,
        count=1,
    )
    if count == 1:
        t = t2
        print("disabled panel media proxy", p)
    else:
        t3, count2 = re.subn(
            r"(?ms)^    location ~ \^/\(player_api\\.php\|panel_api\\.php\|get\\.php\|xmltv\\.php\|live/\|timeshift/\|movie/\|series/\|c/\|stalker_portal/\) \{\n.*?^    \}\n",
            MEDIA + "\n" + API,
            t,
            count=1,
        )
        if count2 == 1:
            t = t3
            print("split+disabled media", p)
        else:
            print(f"skip media {p}: dedicated={count} combined={count2}")
            continue
    t4, napi = re.subn(
        r"(?ms)^    location ~ \^/\(player_api\\.php\|panel_api\\.php\|get\\.php\|xmltv\\.php\|c/\|stalker_portal/\) \{\n.*?^    \}\n",
        API,
        t,
        count=1,
    )
    if napi == 1:
        t = t4
        print("api→panel", p)
    t5, nxml = re.subn(
        r"(?ms)^    location = /xmltv\.php \{\n.*?^    \}\n",
        XMLTV,
        t,
        count=1,
    )
    if nxml == 1:
        t = t5
        print("xmltv exact→panel", p)
    p.write_text(t)
    print("wrote", p)
PY
