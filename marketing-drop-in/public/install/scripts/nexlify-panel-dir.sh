#!/usr/bin/env bash
# Shared panel-root detection. New installs live at /home/nexlify.
# Existing /home/nexlify-panel and /opt/nexlify-panel trees still win when present.
#
# Usage:  # shellcheck source=nexlify-panel-dir.sh
#         . "$(dirname "$0")/nexlify-panel-dir.sh"
#         PANEL="$(nexlify_find_panel_dir)" || PANEL="$NEXLIFY_DEFAULT_PANEL_DIR"

NEXLIFY_DEFAULT_PANEL_DIR="${NEXLIFY_DEFAULT_PANEL_DIR:-/home/nexlify}"

nexlify_is_panel_root() {
  local d="${1:-}"
  [ -n "$d" ] && [ -f "$d/package.json" ] || return 1
  grep -q '"name": "nexlify"' "$d/package.json" 2>/dev/null || return 1
  grep -q '"name": "nexlify-marketing"' "$d/package.json" 2>/dev/null && return 1
  return 0
}

nexlify_find_panel_dir() {
  local d
  for d in \
    ${PANEL_DIR:+"$PANEL_DIR"} \
    ${NEXLIFY_PANEL_DIR:+"$NEXLIFY_PANEL_DIR"} \
    /home/nexlify \
    /home/nexlify-panel \
    /opt/nexlify-panel
  do
    [ -n "$d" ] || continue
    if nexlify_is_panel_root "$d"; then
      printf '%s\n' "$d"
      return 0
    fi
  done
  return 1
}

# --fresh / re-extract: keep /home/nexlify/bin (ffmpeg, nginx, php) if present.
nexlify_wipe_panel_tree() {
  local d="${1:-}"
  [ -n "$d" ] && [ -e "$d" ] || return 0
  if [ -d "$d/bin" ]; then
    local hold
    hold="$(mktemp -d /tmp/nexlify-bin-XXXXXX)"
    mv "$d/bin" "$hold/bin"
    rm -rf "$d"
    mkdir -p "$d"
    mv "$hold/bin" "$d/bin"
    rmdir "$hold" 2>/dev/null || true
  else
    rm -rf "$d"
  fi
}
