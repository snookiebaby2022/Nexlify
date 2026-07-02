#!/usr/bin/env bash
# Transcode live RTMP to 720p HLS (runs alongside nginx native 1080p HLS).
# Invoked by nginx-rtmp exec_publish — must not touch nexlify.m3u8 / nexlify-*.ts.
set -uo pipefail

NAME="${1:-nexlify}"
OUT="/var/www/nexlify-hls"
LOG="/var/log/nexlify-hls-720-ffmpeg.log"
RTMP="rtmp://127.0.0.1:1935/live/${NAME}"
MARKER="${NAME}-720.m3u8"

pkill -f "$MARKER" 2>/dev/null || true
rm -f "${OUT}/${NAME}-720.m3u8" "${OUT}/${NAME}-720-"*.ts 2>/dev/null || true

nohup ffmpeg -hide_banner -loglevel warning -nostdin \
  -i "$RTMP" \
  -vf "scale=-2:720" \
  -c:v libx264 -preset veryfast -tune zerolatency -profile:v main -level 4.0 \
  -g 120 -keyint_min 120 -sc_threshold 0 \
  -b:v 2500k -maxrate 3000k -bufsize 6000k \
  -c:a copy \
  -f hls \
  -hls_time 2 \
  -hls_list_size 15 \
  -hls_flags delete_segments+append_list+temp_file \
  -hls_segment_filename "${OUT}/${NAME}-720-%d.ts" \
  "${OUT}/${NAME}-720.m3u8" \
  >>"$LOG" 2>&1 &

exit 0
