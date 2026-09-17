#!/usr/bin/env bash
# Capture HTTPS (tcp/443) on the panel main interface for 60s, then tshark I/O table.
#
# Usage:
#   sudo bash scripts/diag-https-io-capture.sh
#   IFACE=eth0 DURATION=60 OUT_DIR=/tmp bash scripts/diag-https-io-capture.sh
#
# Requires: tcpdump, tshark (wireshark-cli). Saves pcap under /tmp (or OUT_DIR).
set -euo pipefail

DURATION="${DURATION:-60}"
OUT_DIR="${OUT_DIR:-/tmp}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PCAP="${OUT_DIR}/nexlify-https-${STAMP}.pcap"
IO_TXT="${OUT_DIR}/nexlify-https-io-${STAMP}.txt"

if [[ -z "${IFACE:-}" ]]; then
  IFACE="$(ip -o route show default 2>/dev/null | awk '{print $5; exit}')"
fi
IFACE="${IFACE:-eth0}"

command -v tcpdump >/dev/null || { echo "tcpdump required" >&2; exit 1; }
command -v tshark >/dev/null || { echo "tshark required (wireshark-cli)" >&2; exit 1; }

mkdir -p "$OUT_DIR"
echo "Capturing tcp port 443 on ${IFACE} for ${DURATION}s → ${PCAP}"

# shellcheck disable=SC2086
timeout --signal=INT "$((DURATION + 5))" tcpdump -i "$IFACE" -nn -s 128 \
  "tcp port 443" -w "$PCAP" &
TCPDUMP_PID=$!

sleep "$DURATION"
kill -INT "$TCPDUMP_PID" 2>/dev/null || true
wait "$TCPDUMP_PID" 2>/dev/null || true

echo "tshark I/O statistics (per second) → ${IO_TXT}"
tshark -r "$PCAP" -q -z io,stat,1 >"$IO_TXT" 2>&1 || {
  echo "tshark failed; pcap still at $PCAP" >&2
  exit 1
}

echo "Done."
echo "PCAP: $PCAP"
echo "IO:   $IO_TXT"
head -n 40 "$IO_TXT" || true
