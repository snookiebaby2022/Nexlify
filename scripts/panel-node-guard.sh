#!/usr/bin/env bash
# Source this from rebuild/update scripts.
# Node 1 (production) must not run git-reset rebuilds or live-tree compiles.
panel_node_role() {
  if [ -f /etc/nexlify/panel-node-role ]; then
    tr -d ' \r\n' </etc/nexlify/panel-node-role
    return 0
  fi
  echo "${PANEL_NODE_ROLE:-}"
}

panel_refuse_node1_unsafe_rebuild() {
  local role
  role="$(panel_node_role)"
  [ "$role" = "1" ] || return 0
  if [ "${NEXLIFY_ALLOW_BUILD_ON_NODE1:-}" = "1" ]; then
    echo "WARN: node 1 compile override NEXLIFY_ALLOW_BUILD_ON_NODE1=1"
    return 0
  fi
  echo "ERROR: this host is panel node 1 (production)." >&2
  echo "Do not run rebuild-panel-safe.sh / git reset / live next build here." >&2
  echo "Use: bash scripts/panel-update-pipeline.sh build|verify|apply" >&2
  return 78
}
