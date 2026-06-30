#!/usr/bin/env bash
# 9:16 TikTok demo walkthrough MP4 (~52s) with voiceover. Requires ffmpeg + TTS (espeak-ng or edge-tts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/marketing-drop-in/public/promo/nexlify-tiktok-demo.mp4}"
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
  local vf="drawtext=fontfile=${FONT}:text='${c1}':fontsize=52:fontcolor=${ac}:x=(w-text_w)/2:y=(h-text_h)/2-80:borderw=2:bordercolor=black@0.45"
  if [ -n "$c2" ]; then
    vf="${vf},drawtext=fontfile=${FONT}:text='${c2}':fontsize=30:fontcolor=white@0.88:x=(w-text_w)/2:y=(h-text_h)/2+30"
  fi
  ffmpeg -y -f lavfi -i "color=c=0x060b14:s=1080x1920:d=${dur}" -vf "$vf" \
    -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -r 30 -an "$out" >/dev/null 2>&1
}

tts_to_mp3() {
  local out="$1"
  local text="$2"
  if command -v edge-tts >/dev/null 2>&1; then
    edge-tts --voice en-US-GuyNeural --rate="+5%" --text "$text" --write-media "$out" >/dev/null 2>&1
    return 0
  fi
  if command -v espeak-ng >/dev/null 2>&1; then
    local wav="${out%.mp3}.wav"
    espeak-ng -v en-us+m3 -s 168 -p 48 -w "$wav" "$text"
    ffmpeg -y -i "$wav" -codec:a libmp3lame -qscale:a 3 "$out" >/dev/null 2>&1
    rm -f "$wav"
    return 0
  fi
  echo "Install espeak-ng (apt install espeak-ng) or edge-tts (pip install edge-tts)"
  exit 1
}

concat_videos() {
  local list="$1" out="$2"
  shift 2
  { for f in "$@"; do echo "file '$f'"; done; } > "$list"
  ffmpeg -y -f concat -safe 0 -i "$list" -c copy "$out" >/dev/null 2>&1
}

mux_vo() {
  local video="$1" vo_mp3="$2" vo_dur="$3" out="$4"
  ffmpeg -y -i "$video" -i "$vo_mp3" \
    -filter_complex "[1:a]apad=whole_dur=${vo_dur},atrim=0:${vo_dur},volume=1.2[vo];anullsrc=r=44100:cl=mono,atrim=0:${vo_dur}[bg];[bg][vo]amix=inputs=2:duration=first:dropout_transition=0[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -t "$vo_dur" "$out" >/dev/null 2>&1
}

echo "Generating slides..."
slide "$TMP/01.mp4" 4.0 "POV: testing the panel" "Real Nexlify UI · 60 sec" "#22d3ee"
slide "$TMP/02.mp4" 6.0 "Step 1 · Demo login" "panel.demo.nexlify.live" "#fbbf24"
slide "$TMP/02b.mp4" 3.0 "Tap Admin or Reseller" "One-click demo buttons" "#22d3ee"
slide "$TMP/03.mp4" 7.0 "Step 2 · Dashboard" "Streams · lines · connections" "#22c55e"
slide "$TMP/04.mp4" 6.0 "Step 3 · Manage lines" "Add · mass edit · MAG" "#a78bfa"
slide "$TMP/05.mp4" 6.0 "Step 4 · Live connections" "Who is watching · by country" "#38bdf8"
slide "$TMP/06.mp4" 5.5 "Step 5 · Reseller panel" "Credits · sub-users" "#fb923c"
slide "$TMP/07.mp4" 4.5 "Read-only demo mode" "Explore safely" "#fbbf24"
slide "$TMP/08.mp4" 6.5 "Try it now" "panel.demo.nexlify.live" "#22d3ee"
slide "$TMP/09.mp4" 3.5 "Get your license" "nexlify.live · 7-day trial" "#f97316"

echo "Generating voiceover..."
VO1="Real Nexlify panel — demo mode, no signup."
VO2="One tap Admin… dashboard, lines, who is watching live."
VO3="Reseller view: credits, sub-users, packages."
VO4="Try panel.demo.nexlify.live — link in bio."

tts_to_mp3 "$TMP/vo1.mp3" "$VO1"
tts_to_mp3 "$TMP/vo2.mp3" "$VO2"
tts_to_mp3 "$TMP/vo3.mp3" "$VO3"
tts_to_mp3 "$TMP/vo4.mp3" "$VO4"

echo "Muxing segments..."
concat_videos "$TMP/l1.txt" "$TMP/s1v.mp4" "$TMP/01.mp4" "$TMP/02.mp4" "$TMP/02b.mp4"
mux_vo "$TMP/s1v.mp4" "$TMP/vo1.mp3" 13.0 "$TMP/s1.mp4"

concat_videos "$TMP/l2.txt" "$TMP/s2v.mp4" "$TMP/03.mp4" "$TMP/04.mp4" "$TMP/05.mp4"
mux_vo "$TMP/s2v.mp4" "$TMP/vo2.mp3" 19.0 "$TMP/s2.mp4"

concat_videos "$TMP/l3.txt" "$TMP/s3v.mp4" "$TMP/06.mp4" "$TMP/07.mp4"
mux_vo "$TMP/s3v.mp4" "$TMP/vo3.mp3" 10.0 "$TMP/s3.mp4"

concat_videos "$TMP/l4.txt" "$TMP/s4v.mp4" "$TMP/08.mp4" "$TMP/09.mp4"
mux_vo "$TMP/s4v.mp4" "$TMP/vo4.mp3" 10.0 "$TMP/s4.mp4"

{
  echo "file '$TMP/s1.mp4'"
  echo "file '$TMP/s2.mp4'"
  echo "file '$TMP/s3.mp4'"
  echo "file '$TMP/s4.mp4'"
} > "$TMP/final.txt"

ffmpeg -y -f concat -safe 0 -i "$TMP/final.txt" -c copy -movflags +faststart "$OUT" >/dev/null 2>&1
echo "Created $OUT ($(du -h "$OUT" | cut -f1)) with voiceover"
