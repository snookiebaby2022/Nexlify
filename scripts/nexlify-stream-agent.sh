#!/usr/bin/env bash
# Nexlify stream server agent v2.2 — argv ffmpeg start/stop (no eval of panel commands)
set -euo pipefail

PANEL_URL="${PANEL_URL:?Set PANEL_URL}"
AGENT_TOKEN="${AGENT_TOKEN:?Set AGENT_TOKEN}"
POLL_SECS="${POLL_SECS:-30}"
CONFIG_DIR="${CONFIG_DIR:-/etc/nexlify-agent}"
mkdir -p "$CONFIG_DIR"

auth_hdr="Authorization: Bearer ${AGENT_TOKEN}"

write_nginx_snippet() {
  local snippet
  snippet="$(jq -r '.config.nginxSnippet // empty' "$CONFIG_DIR/poll.json" 2>/dev/null || true)"
  if [[ -z "$snippet" ]]; then return 0; fi
  local out="${NGINX_SNIPPET_PATH:-/etc/nexlify-agent/nginx-snippet.conf}"
  printf '%s\n' "$snippet" > "$out"
  if command -v nginx >/dev/null 2>&1; then
    nginx -s reload 2>/dev/null || true
  fi
}

stop_stream_pid() {
  local pid_file="$1"
  if [[ -n "$pid_file" && "$pid_file" == /var/run/nexlify/* && -f "$pid_file" ]]; then
    local pid
    pid="$(tr -dc '0-9' < "$pid_file" | head -c 12)"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

start_ffmpeg_argv() {
  local entry="$1"
  local ffmpeg pid_file log_file
  ffmpeg="$(echo "$entry" | jq -r '.ffmpegPath // empty')"
  pid_file="$(echo "$entry" | jq -r '.pidFile // empty')"
  log_file="$(echo "$entry" | jq -r '.logFile // empty')"
  [[ "$ffmpeg" == /* && "$ffmpeg" != *..* ]] || return 1
  [[ -x "$ffmpeg" ]] || return 1
  [[ "$pid_file" == /var/run/nexlify/* ]] || return 1
  [[ "$log_file" == /var/log/nexlify/* ]] || return 1
  mkdir -p "$(dirname "$pid_file")" "$(dirname "$log_file")"
  stop_stream_pid "$pid_file"
  local args=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && args+=("$line")
  done < <(echo "$entry" | jq -r '.ffmpegArgs[]?')
  [[ ${#args[@]} -gt 0 ]] || return 1
  nohup "$ffmpeg" "${args[@]}" > "$log_file" 2>&1 &
  echo $! > "$pid_file"
}

run_stream_cmd() {
  local action="$1" stream_id="$2"
  local entry
  entry="$(jq -c --arg id "$stream_id" '.config.streams[] | select(.id==$id)' "$CONFIG_DIR/poll.json" 2>/dev/null | head -1)"
  [[ -z "$entry" ]] && return 1
  case "$action" in
    start_stream|restart_stream)
      start_ffmpeg_argv "$entry"
      ;;
    stop_stream)
      stop_stream_pid "$(echo "$entry" | jq -r '.pidFile // empty')"
      ;;
    probe_stream)
      # Reachability check from this stream server (not the panel host)
      local probe_url
      probe_url="${PROBE_URL:-}"
      if [[ -z "$probe_url" ]]; then
        probe_url="$(echo "$entry" | jq -r '.streamUrl // .url // empty')"
      fi
      [[ -z "$probe_url" ]] && return 1
      if curl -fsSI --max-time 8 -A "Nexlify-Agent-Probe/1.0" "$probe_url" >/dev/null 2>&1 \
        || curl -fsS --max-time 8 -A "Nexlify-Agent-Probe/1.0" -o /dev/null -w "" "$probe_url" >/dev/null 2>&1; then
        return 0
      fi
      return 1
      ;;
  esac
}

poll_commands() {
  curl -fsS -H "$auth_hdr" "${PANEL_URL}/api/agent/poll" -o "$CONFIG_DIR/poll.json" || return 1
  write_nginx_snippet
  command -v jq >/dev/null 2>&1 || return 0
  jq -c '.commands[]?' "$CONFIG_DIR/poll.json" 2>/dev/null | while read -r cmd; do
    local id action stream_id ok=1 result="ok"
    id="$(echo "$cmd" | jq -r '.id')"
    action="$(echo "$cmd" | jq -r '.action')"
    stream_id="$(echo "$cmd" | jq -r '.payload.streamId // empty')"
    if [[ "$action" == "apply_config" ]]; then
      write_nginx_snippet
    elif [[ "$action" == "clear_cache" ]]; then
      rm -rf /var/cache/nginx/* 2>/dev/null || true
      rm -rf "${CONFIG_DIR}/cache"/* 2>/dev/null || true
      find /tmp -maxdepth 1 -name 'nexlify-*' -mtime +0 -exec rm -rf {} + 2>/dev/null || true
      write_nginx_snippet
      result="cache cleared"
    elif [[ "$action" == "reboot_server" ]]; then
      result="reboot scheduled"
      ( /bin/sleep 3; /sbin/reboot ) >/dev/null 2>&1 &
    elif [[ -n "$stream_id" ]]; then
      if [[ "$action" == "probe_stream" ]]; then
        PROBE_URL="$(echo "$cmd" | jq -r '.payload.url // empty')"
        export PROBE_URL
      fi
      if run_stream_cmd "$action" "$stream_id"; then ok=1; else ok=0; result="cmd failed"; fi
      unset PROBE_URL 2>/dev/null || true
    else
      ok=1
      result="ignored (unknown action)"
    fi
    curl -fsS -X POST -H "$auth_hdr" -H "Content-Type: application/json" \
      "${PANEL_URL}/api/agent/ack" \
      -d "{\"commandId\":\"$id\",\"ok\":$ok,\"result\":\"$result\"}" >/dev/null || true
  done
}

report_heartbeat() {
  local procs="[]"
  if command -v jq >/dev/null 2>&1 && [[ -f "$CONFIG_DIR/poll.json" ]]; then
    procs="$(jq -c '[.config.streams[] | {
      streamId: .id,
      pid: .agentPid,
      name: .name,
      status: (if .agentPid then "running" else "unknown" end)
    }]' "$CONFIG_DIR/poll.json" 2>/dev/null || echo '[]')"
  fi

  local cores load cpu mem disk
  cores="$(nproc 2>/dev/null || echo 1)"
  [[ "$cores" -lt 1 ]] && cores=1
  load="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)"
  cpu="$(awk -v l="$load" -v c="$cores" 'BEGIN { p=int((l/c)*100+0.5); if (p<0) p=0; if (p>100) p=100; print p }')"
  mem="$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END { if (t>0) print int(((t-a)/t)*100+0.5); else print 0 }' /proc/meminfo 2>/dev/null || echo 0)"
  disk="$(df -P / 2>/dev/null | awk 'NR==2 { gsub(/%/,""); print $5+0 }' || echo 0)"

  local iface rx tx now dt download=0 upload=0 cap_mbps=1000
  iface="$(awk '$2=="00000000" {print $1; exit}' /proc/net/route 2>/dev/null || echo eth0)"
  rx="$(awk -v i="$iface" '$1==i":" {print $2; exit}' /proc/net/dev 2>/dev/null || echo 0)"
  tx="$(awk -v i="$iface" '$1==i":" {print $10; exit}' /proc/net/dev 2>/dev/null || echo 0)"
  now="$(date +%s)"
  if [[ -f "$CONFIG_DIR/net.last" ]]; then
    local prev_at prev_rx prev_tx prev_iface
    read -r prev_at prev_rx prev_tx prev_iface < "$CONFIG_DIR/net.last" || true
    if [[ "${prev_iface:-}" == "$iface" && "${prev_at:-0}" -gt 0 ]]; then
      dt=$((now - prev_at))
      if [[ "$dt" -ge 1 ]]; then
        local rx_mbps tx_mbps
        rx_mbps=$(( (rx - prev_rx) * 8 / dt / 1000000 ))
        tx_mbps=$(( (tx - prev_tx) * 8 / dt / 1000000 ))
        [[ "$rx_mbps" -lt 0 ]] && rx_mbps=0
        [[ "$tx_mbps" -lt 0 ]] && tx_mbps=0
        download=$(( rx_mbps * 100 / cap_mbps ))
        upload=$(( tx_mbps * 100 / cap_mbps ))
        [[ "$download" -gt 100 ]] && download=100
        [[ "$upload" -gt 100 ]] && upload=100
      fi
    fi
  fi
  printf '%s %s %s %s\n' "$now" "$rx" "$tx" "$iface" > "$CONFIG_DIR/net.last"

  curl -fsS -X POST -H "$auth_hdr" -H "Content-Type: application/json" \
    "${PANEL_URL}/api/agent/heartbeat" \
    -d "{\"version\":\"2.2.0\",\"processes\":${procs},\"cpu\":${cpu:-0},\"memory\":${mem:-0},\"storage\":${disk:-0},\"upload\":${upload},\"download\":${download}}" >/dev/null || true
}

while true; do
  poll_commands || true
  report_heartbeat || true
  sleep "$POLL_SECS"
done
