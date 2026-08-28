#!/usr/bin/env bash
# Release nginx from TCP ports that another process must own (IPTV edge).
#
# One TCP port can only be bound by one process. Nginx and the Node IPTV edge
# cannot both listen on :8080 (or :25461 / optional :443). When edge owns those
# ports, nginx must not keep listen directives for them — otherwise a later
# `systemctl restart nginx` fails with "Address already in use" and the whole
# nginx process dies (including :80 panel UI).
#
# Usage:
#   bash scripts/nexlify-nginx-release-ports.sh 8080 25461
#   NEXLIFY_RELEASE_PORTS="8080,25461,443" bash scripts/nexlify-nginx-release-ports.sh
#
# Safe to re-run. Never disables nginx listens on :80 (panel HTTP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PORTS_RAW="${NEXLIFY_RELEASE_PORTS:-$*}"
PORTS_RAW="${PORTS_RAW//,/ }"

# Always protect panel HTTP — never strip :80.
PROTECTED="80"

should_release() {
  local p="$1"
  [ -z "$p" ] && return 1
  for keep in $PROTECTED; do
    [ "$p" = "$keep" ] && return 1
  done
  return 0
}

PORT_LIST=""
for p in $PORTS_RAW; do
  should_release "$p" || continue
  case " $PORT_LIST " in
    *" $p "*) ;;
    *) PORT_LIST="$PORT_LIST $p" ;;
  esac
done
PORT_LIST="${PORT_LIST# }"

if [ -z "$PORT_LIST" ]; then
  echo "[nginx-release] No ports to release"
  exit 0
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "[nginx-release] nginx not installed — nothing to do for: $PORT_LIST"
  exit 0
fi

echo "[nginx-release] Ensuring nginx does not listen on: $PORT_LIST"

disable_conf() {
  local path="$1"
  [ -e "$path" ] || return 0
  if [ -L "$path" ]; then
    rm -f "$path"
    echo "[nginx-release] unlinked $path"
    return 0
  fi
  if [[ "$path" == *.disabled ]]; then
    return 0
  fi
  mv -f "$path" "${path}.disabled"
  echo "[nginx-release] disabled $path → ${path}.disabled"
}

# Never disable nginx panel HTTPS vhost — edge must not steal :443 on domain installs.
for f in \
  /etc/nginx/conf.d/nexlify-stream-edge.conf \
  /etc/nginx/conf.d/nexlify-stream-extra.conf \
  /etc/nginx/conf.d/nexlify-https-extra.conf \
  /etc/nginx/conf.d/nexlify-panel-ssl.conf; do
  if [ -f "$f" ]; then
    # Only disable if the file listens on one of the released ports
    needs=0
    for p in $PORT_LIST; do
      if grep -EqE "listen[[:space:]]+(\[::\]:)?${p}([[:space:];]|$)" "$f" 2>/dev/null; then
        needs=1
        break
      fi
    done
    if [ "$needs" = "1" ]; then
      disable_conf "$f"
    fi
  fi
done

# Scan remaining conf.d + sites-enabled for listen directives on edge ports
scan_dirs="/etc/nginx/conf.d /etc/nginx/sites-enabled"
for dir in $scan_dirs; do
  [ -d "$dir" ] || continue
  while IFS= read -r -d '' conf; do
    [[ "$conf" == *.disabled ]] && continue
    base="$(basename "$conf")"
  # nexlify-panel-https.conf is nginx TLS for panel+IPTV — never comment/disable on port release.
    if [ "$base" = "nexlify-panel-https.conf" ]; then
      continue
    fi
    needs=0
    for p in $PORT_LIST; do
      if grep -EqE "listen[[:space:]]+(\[::\]:)?${p}([[:space:];]|$)" "$conf" 2>/dev/null; then
        needs=1
        break
      fi
    done
    [ "$needs" = "1" ] || continue
    # Never disable a vhost that still serves panel HTTP on :80.
    if grep -EqE 'listen[[:space:]]+(\[::\]:)?80([[:space:];]|$)' "$conf" 2>/dev/null; then
      tmp="${conf}.nexlify-release.tmp"
      cp -a "$conf" "$tmp"
      for p in $PORT_LIST; do
        sed -i -E "s/^([[:space:]]*)listen[[:space:]]+(\[::\]:)?${p}([[:space:];].*)?$/\1# nexlify-release: listen \2${p}\3/" "$tmp" || true
      done
      if ! cmp -s "$conf" "$tmp"; then
        mv -f "$tmp" "$conf"
        echo "[nginx-release] commented non-80 listen lines in $conf (kept :80)"
      else
        rm -f "$tmp"
      fi
      continue
    fi
    # Prefer disabling whole site/conf that only exists for IPTV edge ports
    base="$(basename "$conf")"
    case "$base" in
      nexlify-stream*|nexlify-https*|nexlify-panel-ssl*|default)
        disable_conf "$conf"
        ;;
      *)
        # Comment out listen lines for released ports only (preserve rest of vhost).
        # Critical for MovieFlix/moviestream: may listen on 8080 + 443 — only strip
        # edge-owned ports; never disable the whole site (would break snookiebaby.xyz).
        tmp="${conf}.nexlify-release.tmp"
        cp -a "$conf" "$tmp"
        for p in $PORT_LIST; do
          sed -i -E "s/^([[:space:]]*)listen[[:space:]]+(\[::\]:)?${p}([[:space:];].*)?$/\1# nexlify-release: listen \2${p}\3/" "$tmp" || true
        done
        if ! cmp -s "$conf" "$tmp"; then
          mv -f "$tmp" "$conf"
          echo "[nginx-release] commented listen lines in $conf"
        else
          rm -f "$tmp"
        fi
        ;;
    esac
  done < <(find "$dir" -maxdepth 1 -type f \( -name '*.conf' -o -name '*' \) ! -name '*.disabled' ! -name '*.tmp' -print0 2>/dev/null)
done

# Validate + ensure nginx is running on remaining ports (:80 etc.)
if nginx -t 2>/dev/null; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
  else
    systemctl start nginx 2>/dev/null || true
  fi
else
  echo "[nginx-release] WARN: nginx -t failed after release — attempting restart anyway" >&2
  systemctl restart nginx 2>/dev/null || true
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  echo "[nginx-release] nginx is active after releasing: $PORT_LIST"
else
  echo "[nginx-release] WARN: nginx still not active — check journalctl -u nginx" >&2
fi
