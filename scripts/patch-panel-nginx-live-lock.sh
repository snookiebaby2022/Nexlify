#!/usr/bin/env bash
# Refuse panel media *hairpin through Next* — for classic-lb XUI mode, proxy media
# to local classic-lb (nginx/PHP+FFmpeg) on :80/:443 so Main can play like XUI Main.
# Never return 302 (Xtream apps ignore redirects).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/live-routing-env.sh"

PANEL_LISTEN="$(nexlify_resolve_panel_listen)"
REMOTE="$(nexlify_resolve_remote_edge)"
REMOTE_IP="$(nexlify_remote_edge_ip)"
if [ -z "$REMOTE_IP" ]; then
  REMOTE_IP="127.0.0.1"
fi

# Classic LB on this box → XUI Main plays on :80/:443 via local proxy (not 502).
CLASSIC_LOCAL=0
if [ "${NEXLIFY_CLASSIC_LB:-0}" = "1" ] || [ "${NEXLIFY_PLAYBACK_TOPOLOGY:-}" = "classic-lb" ]; then
  CLASSIC_LOCAL=1
fi
# If remote edge is this host (or loopback), always use local proxy for classic-lb.
case "$REMOTE_IP" in
  127.0.0.1|localhost) CLASSIC_LOCAL=1 ;;
esac
if [ -f /etc/nexlify-lb/lb.env ] && ss -lntp 2>/dev/null | grep -qE ':8090\b'; then
  CLASSIC_LOCAL=1
fi

LB_UPSTREAM="${NEXLIFY_CLASSIC_LB_UPSTREAM:-127.0.0.1:8090}"

export NEXLIFY_PATCH_PANEL_LISTEN="$PANEL_LISTEN"
export NEXLIFY_PATCH_REMOTE_IP="$REMOTE_IP"
export NEXLIFY_PATCH_CLASSIC_LOCAL="$CLASSIC_LOCAL"
export NEXLIFY_PATCH_LB_UPSTREAM="$LB_UPSTREAM"

python3 - <<'PY'
import os
import re
from pathlib import Path

panel_listen = os.environ["NEXLIFY_PATCH_PANEL_LISTEN"]
remote_ip = os.environ["NEXLIFY_PATCH_REMOTE_IP"]
classic_local = os.environ.get("NEXLIFY_PATCH_CLASSIC_LOCAL", "0") == "1"
lb_upstream = os.environ.get("NEXLIFY_PATCH_LB_UPSTREAM", "127.0.0.1:8090")

if classic_local:
    # XUI Main: same hostname serves /live on :80/:443 → classic-lb restream (no Next).
    MEDIA = f"""    location ~ ^/(live|timeshift|movie|series)/ {{
        # XUI-style Main: proxy to classic-lb (FFmpeg), never through Next.js
        proxy_pass http://{lb_upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_max_temp_file_size 0;
        proxy_cache off;
        tcp_nodelay on;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }}
"""
else:
    MEDIA = f"""    location ~ ^/(live|timeshift|movie|series)/ {{
        # Remote LB only — panel must not hairpin media bitrate.
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
        print("patched panel media", p, "mode=", "xui-proxy" if classic_local else "502")
    else:
        t3, count2 = re.subn(
            r"(?ms)^    location ~ \^/\(player_api\\.php\|panel_api\\.php\|get\\.php\|xmltv\\.php\|live/\|timeshift/\|movie/\|series/\|c/\|stalker_portal/\) \{\n.*?^    \}\n",
            MEDIA + "\n" + API,
            t,
            count=1,
        )
        if count2 == 1:
            t = t3
            print("split+patched media", p)
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
