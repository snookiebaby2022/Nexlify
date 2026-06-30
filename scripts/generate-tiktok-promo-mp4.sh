#!/usr/bin/env bash
# Build 9:16 TikTok promo MP4 (1080x1920, ~36s). Requires ffmpeg on the server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/marketing-drop-in/public/promo/nexlify-tiktok-ad.mp4}"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not installed. Run: apt-get install -y ffmpeg"
  exit 1
fi

FONT=""
for f in \
  /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
  /usr/share/fonts/dejavu/DejaVuSans-Bold.ttf \
  /usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf; do
  if [ -f "$f" ]; then FONT="$f"; break; fi
  done
if [ -z "$FONT" ]; then
  echo "No TTF font found for drawtext"
  exit 1
fi

slide() {
  local out="$1" dur="$2" c1="$3" c2="${4:-}" ac="${5:-#22d3ee}"
  local vf="drawtext=fontfile=${FONT}:text='${c1}':fontsize=58:fontcolor=${ac}:x=(w-text_w)/2:y=(h-text_h)/2-60:borderw=2:bordercolor=black@0.4"
  if [ -n "$c2" ]; then
    vf="${vf},drawtext=fontfile=${FONT}:text='${c2}':fontsize=34:fontcolor=white@0.85:x=(w-text_w)/2:y=(h-text_h)/2+50"
  fi
  ffmpeg -y -f lavfi -i "color=c=0x060b14:s=1080x1920:d=${dur}" -vf "$vf" \
    -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r 30 -an "$out" >/dev/null 2>&1
}

slide "$TMP/01.mp4" 5.2 "Your panel is costing you subs." "Not making you money." "#fb923c"
slide "$TMP/02.mp4" 5.2 "Legacy stacks hurt." "Frozen lines · manual renewals" "#a78bfa"
slide "$TMP/03.mp4" 5.2 "NEXLIFY" "Stream management, built for operators" "#22d3ee"
slide "$TMP/04.mp4" 4.8 "Anti-freeze built in" "Fast zapping · live edges" "#22d3ee"
slide "$TMP/05.mp4" 4.8 "Reseller tree + WHMCS" "Credits · packages · auto billing" "#a78bfa"
slide "$TMP/06.mp4" 4.8 "Try it live. Right now." "panel.nexlify.live · admin / admin123" "#22d3ee"
slide "$TMP/07.mp4" 6.0 "Get your license" "7-day trial · nexlify.live" "#fb923c"

{
  for f in "$TMP"/*.mp4; do echo "file '$f'"; done
} > "$TMP/list.txt"

ffmpeg -y -f concat -safe 0 -i "$TMP/list.txt" -c copy -movflags +faststart "$OUT" >/dev/null 2>&1
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
