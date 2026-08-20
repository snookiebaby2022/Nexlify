#!/usr/bin/env bash
# Install the shared Nexlify fleet GitHub deploy key on this VPS.
#
# Generate the key ONCE on your PC (keep private key safe):
#   ssh-keygen -t ed25519 -f nexlify-fleet -N "" -C "nexlify-fleet"
#   # Add nexlify-fleet.pub to GitHub → snookiebaby2022/Nexlify → Settings → Deploy keys
#
# Install on each VPS (root):
#   cat nexlify-fleet | bash /opt/nexlify-panel/scripts/install-fleet-deploy-key.sh
# Or:
#   NEXLIFY_DEPLOY_KEY_FILE=./nexlify-fleet bash scripts/install-fleet-deploy-key.sh
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/vps-git-auth.sh
. "$SCRIPT_DIR/vps-git-auth.sh"

KEY_PATH="$NEXLIFY_FLEET_DEPLOY_KEY"
mkdir -p "$(dirname "$KEY_PATH")"
chmod 700 "$(dirname "$KEY_PATH")"

if [ -n "${NEXLIFY_DEPLOY_KEY_FILE:-}" ] && [ -f "$NEXLIFY_DEPLOY_KEY_FILE" ]; then
  install -m 600 "$NEXLIFY_DEPLOY_KEY_FILE" "$KEY_PATH"
elif [ ! -s "$KEY_PATH" ]; then
  if [ -t 0 ]; then
    echo "Paste the private deploy key, then press Ctrl-D:" >&2
  fi
  cat > "$KEY_PATH"
  chmod 600 "$KEY_PATH"
fi

if [ ! -s "$KEY_PATH" ]; then
  echo "ERROR: no deploy key at $KEY_PATH" >&2
  exit 1
fi

echo "==> Fleet deploy key installed: $KEY_PATH"
echo "==> Public key (must match GitHub Deploy keys entry):"
ssh-keygen -y -f "$KEY_PATH"

ensure_nexlify_git_ssh

echo "==> Testing GitHub SSH ..."
if ! nexlify_git_ssh_works; then
  require_git_auth_hint
  exit 1
fi
echo "GitHub SSH OK"

PANEL=""
for d in "${NEXLIFY_PANEL_DIR:-}" /opt/nexlify-panel /home/nexlify /home/nexlify-panel; do
  [ -n "$d" ] && [ -f "$d/.git/config" ] && PANEL="$d" && break
done

if [ -n "$PANEL" ]; then
  echo "==> Configuring git origin in $PANEL"
  configure_nexlify_git_origin "$PANEL"
  cd "$PANEL"
  git fetch origin main
  echo "Fetched origin/main → $(git rev-parse --short origin/main)"
else
  echo "WARN: no git panel dir found — key installed; run configure after git init"
fi

echo ""
echo "Done. Panel updates (Admin → Updates) will use git fetch over SSH."
echo ""
echo "Next: publish this key to nexlify.live so ALL customer panels get it on update:"
echo "  bash scripts/publish-fleet-deploy-key.sh"
