#!/usr/bin/env python3
"""Raise nginx migrate upload cap to 2048m and stream /api/admin/migrate."""
from pathlib import Path
import sys

BLOCK = """    location /api/admin/migrate {
        client_max_body_size 2048m;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_pass http://nexlify_panel;
    }

"""

def patch(path: Path) -> str:
    t = path.read_text(encoding="utf-8")
    orig = t
    t = t.replace("client_max_body_size 100m;", "client_max_body_size 2048m;")
    t = t.replace("client_max_body_size 100M;", "client_max_body_size 2048m;")
    if "location /api/admin/migrate" not in t:
        if "    location /api/ {" in t:
            t = t.replace("    location /api/ {", BLOCK + "    location /api/ {", 1)
        elif "    location / {" in t:
            t = t.replace("    location / {", BLOCK + "    location / {", 1)
        else:
            return "no-insert-point"
    if t == orig and "location /api/admin/migrate" in t and "2048m" in t:
        return "already"
    path.write_text(t, encoding="utf-8")
    return "patched"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: patch-nginx-migrate-body.py <conf> [conf...]")
    for raw in sys.argv[1:]:
        p = Path(raw)
        print(p, patch(p))
