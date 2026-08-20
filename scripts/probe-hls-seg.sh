#!/usr/bin/env bash
set -euo pipefail
U=Wardonet31 P=VftY9jVbNT SID="${3:-1058467879}"
SEG=$(curl -sS -m 8 "http://127.0.0.1/live/$U/$P/${SID}.m3u8" | grep -v '^#' | head -1)
echo "seg=$SEG"
curl -sS -m 12 -A "XCIPTV/5.0.0" -w " http=%{http_code} bytes=%{size_download}\n" -o /tmp/seg.bin "http://127.0.0.1${SEG}"
xxd /tmp/seg.bin | head -2
echo "=== bad stream m3u8 ==="
curl -sS "http://127.0.0.1/live/$U/$P/1862838169.m3u8"
