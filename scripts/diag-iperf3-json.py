#!/usr/bin/env python3
"""
Run iperf3 between this host and a remote target; emit JSON with timestamps.

Usage:
  python3 scripts/diag-iperf3-json.py --host 209.237.141.15 --port 5201
  python3 scripts/diag-iperf3-json.py --host CLIENT_IP --download --upload --udp

Requires: iperf3 on PATH. Starts no server — target must already run `iperf3 -s`.
Exit 0 on success, 1 on config/tool error, 2 on connection timeout / test failure.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_iperf(
    host: str,
    port: int,
    *,
    reverse: bool,
    udp: bool,
    duration: int,
    bandwidth: str | None,
    timeout: int,
) -> dict:
    cmd = [
        "iperf3",
        "-c",
        host,
        "-p",
        str(port),
        "-t",
        str(duration),
        "-J",
    ]
    if reverse:
        cmd.append("-R")
    if udp:
        cmd.append("-u")
        if bandwidth:
            cmd.extend(["-b", bandwidth])
        else:
            cmd.extend(["-b", "100M"])

    started = iso_now()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        return {
            "ok": False,
            "startedAt": started,
            "finishedAt": iso_now(),
            "error": "connection_timeout",
            "message": f"iperf3 timed out after {timeout}s",
            "stderr": (e.stderr or "")[:2000] if isinstance(e.stderr, str) else "",
            "direction": "download" if reverse else "upload",
            "udp": udp,
        }
    except FileNotFoundError:
        return {
            "ok": False,
            "startedAt": started,
            "finishedAt": iso_now(),
            "error": "iperf3_not_found",
            "message": "iperf3 not on PATH",
            "direction": "download" if reverse else "upload",
            "udp": udp,
        }

    finished = iso_now()
    payload: dict = {}
    try:
        payload = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return {
            "ok": False,
            "startedAt": started,
            "finishedAt": finished,
            "error": "invalid_json",
            "message": "iperf3 did not return JSON",
            "stderr": (proc.stderr or "")[:2000],
            "stdout": (proc.stdout or "")[:2000],
            "returncode": proc.returncode,
            "direction": "download" if reverse else "upload",
            "udp": udp,
        }

    err = payload.get("error")
    end = payload.get("end") or {}
    sum_sent = end.get("sum_sent") or end.get("sum") or {}
    sum_recv = end.get("sum_received") or end.get("sum") or {}

    bps_sent = sum_sent.get("bits_per_second")
    bps_recv = sum_recv.get("bits_per_second")

    return {
        "ok": proc.returncode == 0 and not err,
        "startedAt": started,
        "finishedAt": finished,
        "direction": "download" if reverse else "upload",
        "udp": udp,
        "returncode": proc.returncode,
        "error": err or (None if proc.returncode == 0 else "iperf3_failed"),
        "bitsPerSecondSent": bps_sent,
        "bitsPerSecondReceived": bps_recv,
        "mbitsPerSecondSent": (bps_sent / 1e6) if isinstance(bps_sent, (int, float)) else None,
        "mbitsPerSecondReceived": (bps_recv / 1e6) if isinstance(bps_recv, (int, float)) else None,
        "raw": payload if not err else None,
        "stderr": (proc.stderr or "")[:1000] if proc.returncode else "",
    }


def main() -> int:
    p = argparse.ArgumentParser(description="iperf3 → JSON (upload/download/UDP)")
    p.add_argument("--host", required=True, help="iperf3 server host")
    p.add_argument("--port", type=int, default=5201)
    p.add_argument("--duration", type=int, default=10)
    p.add_argument("--timeout", type=int, default=45, help="subprocess timeout seconds")
    p.add_argument("--upload", action="store_true", default=True)
    p.add_argument("--no-upload", action="store_true")
    p.add_argument("--download", action="store_true", help="iperf3 -R")
    p.add_argument("--udp", action="store_true")
    p.add_argument("--bandwidth", default=None, help="UDP target bitrate (e.g. 100M)")
    p.add_argument("-o", "--output", default=None, help="Write JSON file (default stdout)")
    args = p.parse_args()

    if not shutil.which("iperf3"):
        print(json.dumps({"ok": False, "error": "iperf3_not_found", "startedAt": iso_now()}), file=sys.stderr)
        return 1

    do_upload = not args.no_upload
    tests: list[dict] = []

    if do_upload:
        tests.append(
            run_iperf(
                args.host,
                args.port,
                reverse=False,
                udp=False,
                duration=args.duration,
                bandwidth=None,
                timeout=args.timeout,
            )
        )
    if args.download:
        tests.append(
            run_iperf(
                args.host,
                args.port,
                reverse=True,
                udp=False,
                duration=args.duration,
                bandwidth=None,
                timeout=args.timeout,
            )
        )
    if args.udp:
        tests.append(
            run_iperf(
                args.host,
                args.port,
                reverse=False,
                udp=True,
                duration=args.duration,
                bandwidth=args.bandwidth,
                timeout=args.timeout,
            )
        )

    report = {
        "ok": all(t.get("ok") for t in tests) if tests else False,
        "startedAt": tests[0]["startedAt"] if tests else iso_now(),
        "finishedAt": iso_now(),
        "host": args.host,
        "port": args.port,
        "tests": tests,
    }

    text = json.dumps(report, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)

    if any(t.get("error") == "connection_timeout" for t in tests):
        return 2
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
