#!/bin/bash
set -euo pipefail
cd /c/Users/lizzi/nexlify-panel
git add src/lib/connection-quality-live.ts src/lib/connection-quality-live.test.ts src/lib/connection-quality.ts
git commit -m "$(cat <<'EOF'
Count live QoE stalls from empty pulses, not delayed video batches.

Edge heartbeats every ~15s were treated as buffering whenever a flush ran late, even when the pulse still carried megabytes of MPEG-TS.

EOF
)"
git log -1 --oneline
git status --short | head -15
