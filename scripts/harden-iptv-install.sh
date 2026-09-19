#!/usr/bin/env bash
# Harden any panel / classic-LB install for production IPTV (XUI-style stack).
# Safe to re-run. No panel rebuild.
#
# Invoked by:
#   scripts/classic-lb/install.sh
#   scripts/apply-iptv-production-stack.sh
#   scripts/apply-streaming-safeguards.sh (optional)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[harden-iptv] $*"; }

ENV_LB="${NEXLIFY_LB_ENV:-/etc/nexlify-lb/lb.env}"
INSTALL_LB="${INSTALL_ROOT:-/opt/nexlify-lb}"

# --- Auto-size FPM / nginx / kernel from this box's RAM+CPU (every install) ---
# Classic-LB + panel-php installers already call this; harden re-applies so
# one-click panel installs, updates, and production-stack runs stay correct
# even if someone previously hand-edited pm.max_children.
if [ -x "$ROOT/scripts/tune-capacity-50k.sh" ]; then
  bash "$ROOT/scripts/tune-capacity-50k.sh" || log "WARN: tune-capacity-50k failed"
  log "capacity auto-tune ok"
elif [ -f "$ROOT/scripts/lib/nexlify-capacity.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/scripts/lib/nexlify-capacity.sh"
  nexlify_capacity_compute "$(nexlify_capacity_detect_role)"
  nexlify_capacity_summary || true
  log "capacity computed (tune script missing — pools may need classic-lb/install)"
fi
# Refresh CAP_* in this shell (tune ran in a subprocess).
if [ -f "$ROOT/scripts/lib/nexlify-capacity.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/scripts/lib/nexlify-capacity.sh"
  nexlify_capacity_compute "$(nexlify_capacity_detect_role)" >/dev/null 2>&1 || true
fi

# --- Panel stability cron (prune + maxConn enforce + packager errors → Stream logs) ---
if [ -x "$ROOT/scripts/install-streaming-stability-cron.sh" ]; then
  PANEL_DIR="$ROOT" bash "$ROOT/scripts/install-streaming-stability-cron.sh" || true
  log "stability cron ok"
fi

# Classic-LB → Postgres LiveConnection sync (drops zap ghosts + enforces cap)
if [ -f "$ROOT/scripts/sync-classic-lb-now.cjs" ]; then
  echo '* * * * * root cd '"$ROOT"' && TZ=UTC /usr/bin/node scripts/sync-classic-lb-now.cjs >> /var/log/nexlify-lb-conn-sync.log 2>&1' \
    > /etc/cron.d/nexlify-classic-lb-conn-sync
  chmod 644 /etc/cron.d/nexlify-classic-lb-conn-sync
  log "classic-lb conn sync cron ok"
fi

# --- Classic-LB present: PHP resilience + watchdog + topology ---
if [ -d "$INSTALL_LB/php" ] || [ -f "$ENV_LB" ]; then
  if [ -d "$ROOT/scripts/classic-lb/php" ]; then
    mkdir -p "$INSTALL_LB/php"
    cp -a "$ROOT/scripts/classic-lb/php/." "$INSTALL_LB/php/"
    chmod 644 "$INSTALL_LB/php/"*.php 2>/dev/null || true
    chown -R www-data:www-data "$INSTALL_LB/php" 2>/dev/null || true
    log "classic-lb php synced → $INSTALL_LB/php"
  fi

  if [ -f "$ENV_LB" ]; then
    set_env() {
      local k="$1" v="$2"
      if grep -q "^${k}=" "$ENV_LB" 2>/dev/null; then
        sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_LB"
      else
        echo "${k}=${v}" >> "$ENV_LB"
      fi
    }
    set_env HLS_LIST_SIZE "${HLS_LIST_SIZE:-10}"
    set_env FFMPEG_STALE_SECS "${FFMPEG_STALE_SECS:-12}"
    set_env FFMPEG_RW_TIMEOUT_US "${FFMPEG_RW_TIMEOUT_US:-20000000}"
    set_env FFMPEG_RECONNECT_DELAY_MAX "${FFMPEG_RECONNECT_DELAY_MAX:-5}"
    # Prefer capacity profile when present; otherwise redis (classic-LB default).
    if [ -n "${NEXLIFY_CAP_CONN_HANDLER:-}" ]; then
      set_env CONNECTION_HANDLER "$NEXLIFY_CAP_CONN_HANDLER"
    else
      set_env CONNECTION_HANDLER "${CONNECTION_HANDLER:-redis}"
    fi
    log "lb.env resilience knobs set"
  fi

  # nginx packager-errors export (if classic conf exists)
  CONF=/etc/nginx/conf.d/nexlify-classic-lb.conf
  if [ -f "$CONF" ]; then
    chattr -i "$CONF" 2>/dev/null || true
    if ! grep -q 'packager-errors.json' "$CONF"; then
      python3 - <<'PY' || true
from pathlib import Path
p = Path("/etc/nginx/conf.d/nexlify-classic-lb.conf")
text = p.read_text()
marker = "connections_export.php;\n        fastcgi_pass nexlify_php_auth;\n    }\n"
block = """connections_export.php;
        fastcgi_pass nexlify_php_auth;
    }

    location = /lb/packager-errors.json {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /opt/nexlify-lb/php/packager_errors_export.php;
        fastcgi_pass nexlify_php_auth;
    }
"""
if "packager-errors.json" not in text and marker in text:
    p.write_text(text.replace(marker, block, 1))
    print("nginx packager-errors inserted")
PY
    fi
    # Per-IP live .ts room for multi-device + reconnects + loopback smoke
    # (loopback smoke shares remote_addr unless real_ip rewrites XFF)
    sed -i 's/limit_conn nexlify_perip 16;/limit_conn nexlify_perip 256;/g' "$CONF" || true
    sed -i 's/limit_conn nexlify_perip 32;/limit_conn nexlify_perip 256;/g' "$CONF" || true
    sed -i 's/limit_conn nexlify_perip 64;/limit_conn nexlify_perip 256;/g' "$CONF" || true
    sed -i 's/limit_conn nexlify_perip 128;/limit_conn nexlify_perip 256;/g' "$CONF" || true
  fi

  # Loopback trust for X-Forwarded-For (load tests / panel proxy) — do not duplicate real_ip_header
  CF=/etc/nginx/conf.d/nexlify-cloudflare-realip.conf
  if [ -f "$CF" ] && ! grep -qF 'set_real_ip_from 127.0.0.1' "$CF"; then
    printf '\n# Loopback / smoke tests (X-Forwarded-For)\nset_real_ip_from 127.0.0.1;\nset_real_ip_from ::1;\n' >> "$CF"
  fi

  if [ -f "$ROOT/scripts/classic-lb/nginx-tuning.conf" ]; then
    cp -a "$ROOT/scripts/classic-lb/nginx-tuning.conf" /etc/nginx/conf.d/00-nexlify-lb-tuning.conf
  fi
  nginx -t && systemctl reload nginx || true

  PHP_BIN="$(command -v php8.4 || command -v php8.3 || command -v php || true)"
  if [ -n "$PHP_BIN" ] && [ -f "$INSTALL_LB/php/packager_watchdog.php" ]; then
    echo "* * * * * root NEXLIFY_LB_ENV=${ENV_LB} ${PHP_BIN} ${INSTALL_LB}/php/packager_watchdog.php >> /var/log/nexlify-lb-packager-watchdog.log 2>&1" \
      > /etc/cron.d/nexlify-classic-lb-watchdog
    chmod 644 /etc/cron.d/nexlify-classic-lb-watchdog
    log "packager watchdog cron ok"
  fi

  # XUI classic-lb topology when LB is colocated/active
  if [ -x "$ROOT/scripts/set-topology-classic-lb.sh" ]; then
    CLASSIC_LB_EDGE="${CLASSIC_LB_EDGE:-127.0.0.1:8090}" \
      bash "$ROOT/scripts/set-topology-classic-lb.sh" >/tmp/nexlify-set-topo.log 2>&1 || true
    log "topology → classic-lb (see /tmp/nexlify-set-topo.log)"
  else
    mkdir -p /etc/nexlify
    printf 'classic-lb\n127.0.0.1:8090\n' > /etc/nexlify/playback-topology
  fi

  curl -fsS -m 3 http://127.0.0.1:8090/lb/health >/dev/null 2>&1 && log "lb health ok" || log "WARN: lb health not reachable on :8090"
fi

log "DONE"
