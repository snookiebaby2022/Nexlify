#!/usr/bin/env bash
# 50k-subscriber capacity profile for Nexlify Main + classic-lb.
# Sourced by installers. Sizes PHP-FPM / nginx / kernel from *this box's* RAM/CPU
# so a small VPS does not OOM, while a dedicated LB is ready for thousands of
# concurrent .ts sessions. 50k concurrent on one box is not possible — add LBs.
#
#   NEXLIFY_TARGET_USERS=50000   # catalog / lines (default)
#   NEXLIFY_CAPACITY_ROLE=lb|panel|colocated  # optional override
#
# shellcheck disable=SC2034
: "${NEXLIFY_TARGET_USERS:=50000}"

nexlify_capacity_mem_mb() {
  awk '/MemTotal:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 2048
}

nexlify_capacity_nproc() {
  nproc 2>/dev/null || echo 2
}

nexlify_capacity_clamp() {
  local v="$1" lo="$2" hi="$3"
  if [ "$v" -lt "$lo" ]; then echo "$lo"
  elif [ "$v" -gt "$hi" ]; then echo "$hi"
  else echo "$v"
  fi
}

nexlify_capacity_detect_role() {
  if [ -n "${NEXLIFY_CAPACITY_ROLE:-}" ]; then
    echo "$NEXLIFY_CAPACITY_ROLE"
    return
  fi
  local has_panel=0 has_lb=0
  if [ -d /opt/nexlify-panel ] || [ -f /opt/nexlify-panel/.env ]; then has_panel=1; fi
  if [ -d /opt/nexlify-lb ] || [ -f /etc/nexlify-lb/lb.env ]; then has_lb=1; fi
  if [ "$has_panel" -eq 1 ] && [ "$has_lb" -eq 1 ]; then echo colocated
  elif [ "$has_lb" -eq 1 ] && [ "$has_panel" -eq 0 ]; then echo lb
  else echo panel
  fi
}

# Export: NEXLIFY_CAP_* integers for sed into pool templates.
nexlify_capacity_compute() {
  local role="${1:-$(nexlify_capacity_detect_role)}"
  local mem nproc reserve avail
  mem="$(nexlify_capacity_mem_mb)"
  nproc="$(nexlify_capacity_nproc)"

  case "$role" in
    lb) reserve=1536 ;;
    panel) reserve=3072 ;;
    *) reserve=4096 ;; # colocated Main+LB
  esac
  avail=$((mem - reserve))
  [ "$avail" -lt 512 ] && avail=512

  # MPEG-TS holds one FPM worker for the whole watch (~32–48MB RSS).
  local media
  media=$((avail * 40 / 100 / 36))
  media="$(nexlify_capacity_clamp "$media" 32 1024)"
  # Dedicated LB with ≥16GB: raise floor so a new LB is actually 50k-fleet useful.
  if [ "$role" = "lb" ] && [ "$mem" -ge 16384 ]; then
    media="$(nexlify_capacity_clamp "$media" 256 1024)"
  fi

  local auth
  auth=$((avail * 15 / 100 / 40))
  auth="$(nexlify_capacity_clamp "$auth" 64 512)"
  if [ "$nproc" -ge 8 ]; then
    auth="$(nexlify_capacity_clamp $((auth + nproc * 8)) 128 512)"
  fi

  local panel
  panel=$((avail * 20 / 100 / 64))
  panel="$(nexlify_capacity_clamp "$panel" 64 400)"
  if [ "$role" = "panel" ] || [ "$role" = "colocated" ]; then
    # Catalog refresh storms from 50k lines (player_api / get.php).
    panel="$(nexlify_capacity_clamp $((panel + nproc * 8)) 80 400)"
  fi

  local spare_fn
  spare_fn() {
    local max="$1" start min spare
    start="$(nexlify_capacity_clamp $((max / 10)) 4 32)"
    min="$(nexlify_capacity_clamp $((start / 2)) 2 16)"
    spare="$(nexlify_capacity_clamp $((start * 2)) 8 64)"
    [ "$spare" -gt "$max" ] && spare="$max"
    echo "$start $min $spare"
  }

  # shellcheck disable=SC2046
  set -- $(spare_fn "$media")
  export NEXLIFY_CAP_MEDIA_MAX="$media"
  export NEXLIFY_CAP_MEDIA_START="$1"
  export NEXLIFY_CAP_MEDIA_MIN="$2"
  export NEXLIFY_CAP_MEDIA_SPARE="$3"

  set -- $(spare_fn "$auth")
  export NEXLIFY_CAP_AUTH_MAX="$auth"
  export NEXLIFY_CAP_AUTH_START="$1"
  export NEXLIFY_CAP_AUTH_MIN="$2"
  export NEXLIFY_CAP_AUTH_SPARE="$3"

  set -- $(spare_fn "$panel")
  export NEXLIFY_CAP_PANEL_MAX="$panel"
  export NEXLIFY_CAP_PANEL_START="$1"
  export NEXLIFY_CAP_PANEL_MIN="$2"
  export NEXLIFY_CAP_PANEL_SPARE="$3"

  export NEXLIFY_CAP_ROLE="$role"
  export NEXLIFY_CAP_MEM_MB="$mem"
  export NEXLIFY_CAP_NPROC="$nproc"
  export NEXLIFY_CAP_WWW_MAX=8
  # Redis connections handler when this box can hold >1.5k concurrent TS
  if [ "$media" -ge 128 ]; then
    export NEXLIFY_CAP_CONN_HANDLER=redis
  else
    export NEXLIFY_CAP_CONN_HANDLER=mysql
  fi
}

nexlify_capacity_sub_pool() {
  # stdin/file: replace __PM_*__ and static pm.* lines
  local kind="$1" # media|auth|panel
  local max start min spare
  case "$kind" in
    media)
      max="$NEXLIFY_CAP_MEDIA_MAX"; start="$NEXLIFY_CAP_MEDIA_START"
      min="$NEXLIFY_CAP_MEDIA_MIN"; spare="$NEXLIFY_CAP_MEDIA_SPARE"
      ;;
    auth)
      max="$NEXLIFY_CAP_AUTH_MAX"; start="$NEXLIFY_CAP_AUTH_START"
      min="$NEXLIFY_CAP_AUTH_MIN"; spare="$NEXLIFY_CAP_AUTH_SPARE"
      ;;
    panel)
      max="$NEXLIFY_CAP_PANEL_MAX"; start="$NEXLIFY_CAP_PANEL_START"
      min="$NEXLIFY_CAP_PANEL_MIN"; spare="$NEXLIFY_CAP_PANEL_SPARE"
      ;;
    *) echo "unknown pool $kind" >&2; return 1 ;;
  esac
  sed -e "s|__PM_MAX_CHILDREN__|${max}|g" \
      -e "s|__PM_START_SERVERS__|${start}|g" \
      -e "s|__PM_MIN_SPARE__|${min}|g" \
      -e "s|__PM_MAX_SPARE__|${spare}|g" \
      -e "s|^pm.max_children = .*|pm.max_children = ${max}|" \
      -e "s|^pm.start_servers = .*|pm.start_servers = ${start}|" \
      -e "s|^pm.min_spare_servers = .*|pm.min_spare_servers = ${min}|" \
      -e "s|^pm.max_spare_servers = .*|pm.max_spare_servers = ${spare}|"
}

nexlify_capacity_nginx_events() {
  local conf="${1:-/etc/nginx/nginx.conf}"
  [ -f "$conf" ] || return 0
  python3 - "$conf" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
t = p.read_text()
old = t
import re
t = re.sub(r"worker_connections\s+\d+", "worker_connections 65535", t, count=1)
if "worker_rlimit_nofile" in t:
    t = re.sub(r"worker_rlimit_nofile\s+\d+", "worker_rlimit_nofile 1048576", t, count=1)
elif re.search(r"^worker_processes", t, re.M):
    t = re.sub(r"^(worker_processes[^\n]*\n)", r"\1worker_rlimit_nofile 1048576;\n", t, count=1, flags=re.M)
t = t.replace("\t# multi_accept on;\n", "\tmulti_accept on;\n\tuse epoll;\n")
if "use epoll;" not in t and "multi_accept on" not in t:
    t = t.replace("worker_connections 65535;", "worker_connections 65535;\n\tmulti_accept on;\n\tuse epoll;", 1)
t = t.replace("# gzip_proxied any;", "gzip_proxied any;")
t = t.replace(
    "# gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;",
    "gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;",
)
if t != old:
    p.write_text(t)
    print("nginx events/gzip patched")
else:
    print("nginx events already 50k-ready")
PY
}

nexlify_capacity_shrink_www() {
  local f
  for f in /etc/php/*/fpm/pool.d/www.conf; do
    [ -f "$f" ] || continue
    python3 - "$f" "${NEXLIFY_CAP_WWW_MAX:-8}" <<'PY'
import re, sys
from pathlib import Path
p = Path(sys.argv[1])
cap = int(sys.argv[2])
t = p.read_text()
t2 = re.sub(r"^pm\.max_children\s*=\s*\d+", f"pm.max_children = {cap}", t, count=1, flags=re.M)
if "pm.start_servers" in t2:
    t2 = re.sub(r"^pm\.start_servers\s*=\s*\d+", "pm.start_servers = 2", t2, count=1, flags=re.M)
    t2 = re.sub(r"^pm\.min_spare_servers\s*=\s*\d+", "pm.min_spare_servers = 1", t2, count=1, flags=re.M)
    t2 = re.sub(r"^pm\.max_spare_servers\s*=\s*\d+", "pm.max_spare_servers = 2", t2, count=1, flags=re.M)
if t2 != t:
    p.write_text(t2)
    print(f"shrunk default www pool in {p} to max_children={cap}")
PY
  done
}

nexlify_capacity_sysctl() {
  local dest="${1:-/etc/sysctl.d/99-nexlify-50k.conf}"
  cat > "$dest" <<'SYSCTL'
# Nexlify 50k-subscriber kernel profile (Main + LB)
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 250000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_keepalive_time = 60
net.ipv4.tcp_keepalive_intvl = 10
net.ipv4.tcp_keepalive_probes = 6
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
fs.file-max = 2097152
fs.nr_open = 2097152
SYSCTL
  modprobe tcp_bbr 2>/dev/null || true
  sysctl --system >/dev/null 2>&1 || sysctl -p "$dest" >/dev/null 2>&1 || true
  sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null || true
  sysctl -w net.core.default_qdisc=fq 2>/dev/null || true
}

nexlify_capacity_limits() {
  local dest="${1:-/etc/security/limits.d/99-nexlify-50k.conf}"
  cat > "$dest" <<'LIMITS'
* soft nofile 1048576
* hard nofile 1048576
root soft nofile 1048576
root hard nofile 1048576
www-data soft nofile 1048576
www-data hard nofile 1048576
nginx soft nofile 1048576
nginx hard nofile 1048576
LIMITS
}

nexlify_capacity_redis() {
  local conf=""
  for conf in /etc/redis/redis.conf /etc/redis/redis.conf.d/nexlify.conf; do
    if [ -f /etc/redis/redis.conf ]; then
      conf=/etc/redis/redis.conf
      break
    fi
  done
  [ -f "$conf" ] || return 0
  python3 - "$conf" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = t
def set_line(key, val, text):
    import re
    pat = rf"(?m)^#?\s*{re.escape(key)}\s+.*$"
    if re.search(pat, text):
        return re.sub(pat, f"{key} {val}", text, count=1)
    return text + f"\n{key} {val}\n"
t = set_line("tcp-backlog", "65535", t)
t = set_line("timeout", "0", t)
t = set_line("tcp-keepalive", "60", t)
if t != old:
    p.write_text(t)
    print("redis backlog/keepalive patched")
PY
}

nexlify_capacity_postgres_hint() {
  # Write a drop-in; does not restart Postgres (operator restart on maintenance).
  local d
  for d in /etc/postgresql/*/main/conf.d; do
    [ -d "$d" ] || continue
    local mem
    mem="$(nexlify_capacity_mem_mb)"
    local shared=$((mem / 8))
    [ "$shared" -lt 256 ] && shared=256
    [ "$shared" -gt 4096 ] && shared=4096
    cat > "$d/99-nexlify-50k.conf" <<EOF
# Written by nexlify-capacity — restart postgresql to apply.
max_connections = 400
shared_buffers = ${shared}MB
work_mem = 8MB
maintenance_work_mem = 256MB
effective_cache_size = $((shared * 3))MB
wal_buffers = 16MB
EOF
    echo "postgres drop-in $d/99-nexlify-50k.conf (restart postgres to apply)"
  done
}

nexlify_capacity_summary() {
  echo "NEXLIFY_CAPACITY target_users=${NEXLIFY_TARGET_USERS} role=${NEXLIFY_CAP_ROLE} mem_mb=${NEXLIFY_CAP_MEM_MB} nproc=${NEXLIFY_CAP_NPROC}"
  echo "  media_fpm=${NEXLIFY_CAP_MEDIA_MAX} auth_fpm=${NEXLIFY_CAP_AUTH_MAX} panel_fpm=${NEXLIFY_CAP_PANEL_MAX} conn=${NEXLIFY_CAP_CONN_HANDLER}"
  echo "  Peak concurrent MPEG-TS on THIS box ≈ media_fpm (${NEXLIFY_CAP_MEDIA_MAX}). Add LBs for ${NEXLIFY_TARGET_USERS} lines."
}
