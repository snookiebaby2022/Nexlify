#!/usr/bin/env python3
"""
Listen on a multicast group:port for N seconds; count packets, sequence gaps, jitter.

Usage:
  python3 scripts/diag-multicast-listen.py --group 239.1.1.1 --port 5000
  python3 scripts/diag-multicast-listen.py --group 239.1.1.1 --port 5000 --seconds 10 --iface 0.0.0.0

Assumes optional 2-byte big-endian sequence at payload offset 0 when --seq-offset 0
(common in diagnostic RTP-like probes). Set --no-seq to skip gap detection.
"""
from __future__ import annotations

import argparse
import json
import socket
import struct
import sys
import time
from datetime import datetime, timezone


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> int:
    p = argparse.ArgumentParser(description="Multicast IPTV packet diagnostic")
    p.add_argument("--group", required=True, help="Multicast group address")
    p.add_argument("--port", type=int, required=True)
    p.add_argument("--seconds", type=float, default=10.0)
    p.add_argument("--iface", default="0.0.0.0", help="Interface bind address for membership")
    p.add_argument("--seq-offset", type=int, default=0, help="Byte offset of 16-bit BE sequence")
    p.add_argument("--no-seq", action="store_true", help="Disable sequence gap detection")
    p.add_argument("-o", "--output", default=None)
    args = p.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("", args.port))
    except OSError as e:
        print(json.dumps({"ok": False, "error": str(e), "startedAt": iso_now()}), file=sys.stderr)
        return 1

    mreq = struct.pack("=4s4s", socket.inet_aton(args.group), socket.inet_aton(args.iface))
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    except OSError as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"multicast join failed: {e}",
                    "startedAt": iso_now(),
                }
            ),
            file=sys.stderr,
        )
        return 1

    sock.settimeout(0.25)
    started = iso_now()
    deadline = time.monotonic() + args.seconds
    packets = 0
    bytes_total = 0
    gaps = 0
    last_seq: int | None = None
    arrivals: list[float] = []
    jitter_samples: list[float] = []
    last_arrival: float | None = None

    while time.monotonic() < deadline:
        try:
            data, _addr = sock.recvfrom(65535)
        except socket.timeout:
            continue
        except OSError:
            break
        now = time.monotonic()
        packets += 1
        bytes_total += len(data)
        arrivals.append(now)
        if last_arrival is not None:
            jitter_samples.append(abs(now - last_arrival))
        last_arrival = now

        if not args.no_seq and len(data) >= args.seq_offset + 2:
            seq = struct.unpack_from("!H", data, args.seq_offset)[0]
            if last_seq is not None:
                expected = (last_seq + 1) & 0xFFFF
                if seq != expected:
                    # count wrap-safe distance
                    gap = (seq - expected) & 0xFFFF
                    if 0 < gap < 10000:
                        gaps += gap
            last_seq = seq

    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_DROP_MEMBERSHIP, mreq)
    except OSError:
        pass
    sock.close()

    avg_jitter_ms = None
    if jitter_samples:
        avg_jitter_ms = round((sum(jitter_samples) / len(jitter_samples)) * 1000, 3)
    max_jitter_ms = round(max(jitter_samples) * 1000, 3) if jitter_samples else None
    pps = packets / args.seconds if args.seconds else 0

    report = {
        "ok": packets > 0,
        "startedAt": started,
        "finishedAt": iso_now(),
        "group": args.group,
        "port": args.port,
        "seconds": args.seconds,
        "packets": packets,
        "bytes": bytes_total,
        "packetsPerSecond": round(pps, 2),
        "sequenceGaps": None if args.no_seq else gaps,
        "avgInterArrivalMs": avg_jitter_ms,
        "maxInterArrivalMs": max_jitter_ms,
        "message": None if packets else "No multicast packets received in window",
    }

    text = json.dumps(report, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
