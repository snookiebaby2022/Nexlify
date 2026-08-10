#!/usr/bin/env bash
# Ensure devDependencies required for `npm run build` (tailwindcss, typescript, etc.).
set -euo pipefail
cd "$(dirname "$0")/.."

need_ci=0
for pkg in tailwindcss postcss autoprefixer typescript; do
  if [ ! -d "node_modules/$pkg" ]; then
    echo "ensure-build-deps: missing node_modules/$pkg"
    need_ci=1
    break
  fi
done

if [ "$need_ci" = "1" ] || [ "${FORCE_NPM_CI:-0}" = "1" ]; then
  echo "==> Installing dependencies (including dev — required for build) ..."
  npm ci --include=dev --include=optional --no-audit --no-fund --loglevel=error \
    || npm install --include=dev --include=optional --no-audit --no-fund --loglevel=error
fi

if [ ! -d node_modules/tailwindcss ]; then
  echo "ERROR: tailwindcss still missing after npm ci — check disk space and network" >&2
  exit 1
fi

echo "ensure-build-deps: OK"
