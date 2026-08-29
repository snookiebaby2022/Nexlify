#!/usr/bin/env bash
# GitHub auth for private Nexlify repo on VPS (panel updates + rebuild scripts).
#
# Fleet deploy key (recommended — one key, all servers):
#   1) Generate once: ssh-keygen -t ed25519 -f nexlify-fleet -N "" -C "nexlify-fleet"
#   2) Add nexlify-fleet.pub → GitHub repo → Settings → Deploy keys (read-only)
#   3) On each VPS: cat nexlify-fleet | bash scripts/install-fleet-deploy-key.sh
#
# Alternative: GITHUB_TOKEN with repo read scope in the environment.

NEXLIFY_GIT_REPO="${NEXLIFY_GIT_REPO:-https://github.com/snookiebaby2022/Nexlify.git}"
NEXLIFY_GIT_SSH_REPO="${NEXLIFY_GIT_SSH_REPO:-git@github.com:snookiebaby2022/Nexlify.git}"
NEXLIFY_FLEET_DEPLOY_KEY="${NEXLIFY_FLEET_DEPLOY_KEY:-/root/.nexlify/github-deploy-key}"

ensure_nexlify_git_ssh() {
  local key="$NEXLIFY_FLEET_DEPLOY_KEY"
  [ -f "$key" ] || return 0

  chmod 600 "$key" 2>/dev/null || true
  mkdir -p /root/.ssh /root/.nexlify
  chmod 700 /root/.ssh /root/.nexlify 2>/dev/null || true

  if [ ! -f /root/.ssh/config ] || ! grep -q 'IdentityFile.*github-deploy-key' /root/.ssh/config 2>/dev/null; then
    {
      echo ""
      echo "# Nexlify fleet deploy key (panel git fetch / updates)"
      echo "Host github.com"
      echo "  HostName github.com"
      echo "  User git"
      echo "  IdentityFile $key"
      echo "  IdentitiesOnly yes"
      echo "  StrictHostKeyChecking accept-new"
    } >> /root/.ssh/config
    chmod 600 /root/.ssh/config
  fi

  export GIT_SSH_COMMAND="ssh -i ${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  export GIT_TERMINAL_PROMPT=0
}

nexlify_git_ssh_works() {
  ensure_nexlify_git_ssh
  local out
  out="$(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1)" || true
  echo "$out" | grep -qiE 'successfully authenticated|Hi .+! You'
}

resolve_nexlify_git_url() {
  ensure_nexlify_git_ssh

  if nexlify_git_ssh_works; then
    echo "$NEXLIFY_GIT_SSH_REPO"
    return 0
  fi

  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [ -n "$token" ]; then
    echo "https://${token}@github.com/snookiebaby2022/Nexlify.git"
    return 0
  fi

  echo "$NEXLIFY_GIT_REPO"
}

configure_nexlify_git_origin() {
  local dir="${1:-.}"
  [ -d "$dir/.git" ] || return 0
  git -C "$dir" remote get-url origin >/dev/null 2>&1 || git -C "$dir" remote add origin "$(resolve_nexlify_git_url)"
  git -C "$dir" remote set-url origin "$(resolve_nexlify_git_url)"
}

require_git_auth_hint() {
  cat <<'EOF'
ERROR: Cannot access private GitHub repo snookiebaby2022/Nexlify.

Fix one of:
  1) Fleet deploy key (recommended for all customer VPS):
       cat nexlify-fleet | bash scripts/install-fleet-deploy-key.sh
     Add nexlify-fleet.pub to GitHub → Settings → Deploy keys first.

  2) export GITHUB_TOKEN=ghp_...   # PAT with repo read scope, then re-run

  3) Per-server SSH key in /root/.ssh/id_ed25519 added as a deploy key on GitHub
EOF
}

git_fetch_ok() {
  local url="${1:-$(resolve_nexlify_git_url)}"
  local branch="${2:-main}"
  ensure_nexlify_git_ssh
  git ls-remote "$url" "refs/heads/$branch" >/dev/null 2>&1
}
