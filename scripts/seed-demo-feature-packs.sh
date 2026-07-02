#!/usr/bin/env bash
# Run seed-demo-feature-packs.ts inside panel directory (used on VPS).
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV="${NODE_ENV:-production}"
npx tsx scripts/seed-demo-feature-packs.ts
