#!/usr/bin/env bash
# Shared git URL helper for private Nexlify repo on VPS.
# Set GITHUB_TOKEN (or GH_TOKEN) with repo read access, or configure SSH deploy key.
resolve_nexlify_git_url() {
  local base="${NEXLIFY_GIT_REPO:-https://github.com/snookiebaby2022/Nexlify.git}"
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

  if [ -n "$token" ]; then
    echo "https://${token}@github.com/snookiebaby2022/Nexlify.git"
    return 0
  fi

  if [ -n "${NEXLIFY_GIT_SSH:-}" ] || [ -f "${HOME}/.ssh/id_ed25519" ] || [ -f "${HOME}/.ssh/id_rsa" ]; then
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -qi 'successfully authenticated'; then
      echo "git@github.com:snookiebaby2022/Nexlify.git"
      return 0
    fi
  fi

  echo "$base"
}

require_git_auth_hint() {
  cat <<'EOF'
ERROR: Cannot access private GitHub repo snookiebaby2022/Nexlify.

Fix one of:
  1) export GITHUB_TOKEN=ghp_...   # PAT with repo read scope
     then re-run this script

  2) Add SSH deploy key to GitHub, then:
     export NEXLIFY_GIT_SSH=1
     git clone git@github.com:snookiebaby2022/Nexlify.git

  3) Download from your machine via WinSCP instead of curl GitHub raw URLs
EOF
}

git_fetch_ok() {
  local url="$1"
  local branch="${2:-main}"
  git ls-remote "$url" "refs/heads/$branch" >/dev/null 2>&1
}
