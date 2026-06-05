#!/usr/bin/env bash
# Nexlify stream server agent v2 — config, nginx snippet, ffmpeg start/stop
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
  if [[ -n "${NGINX_RELOAD_CMD:-}" ]]; then
    eval "$NGINX_RELOAD_CMD"
  fi
}

run_stream_cmd() {
  local action="$1" stream_id="$2"
  local entry
  entry="$(jq -c --arg id "$stream_id" '.config.streams[] | select(.id==$id)' "$CONFIG_DIR/poll.json" 2>/dev/null | head -1)"
  [[ -z "$entry" ]] && return 1
  case "$action" in
    start_stream|restart_stream)
      eval "$(echo "$entry" | jq -r '.stopCmd')" 2>/dev/null || true
      eval "$(echo "$entry" | jq -r '.startCmd')"
      ;;
    stop_stream)
      eval "$(echo "$entry" | jq -r '.stopCmd')"
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
      nohup bash -c 'sleep 3 && /sbin/reboot' >/dev/null 2>&1 &
    elif [[ -n "$stream_id" ]]; then
      if run_stream_cmd "$action" "$stream_id"; then ok=1; else ok=0; result="cmd failed"; fi
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
  curl -fsS -X POST -H "$auth_hdr" -H "Content-Type: application/json" \
    "${PANEL_URL}/api/agent/heartbeat" \
    -d "{\"version\":\"2.0.0\",\"processes\":${procs}}" >/dev/null || true
}

while true; do
  poll_commands || true
  report_heartbeat || true
  sleep "$POLL_SECS"
done
