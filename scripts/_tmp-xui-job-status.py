#!/usr/bin/env python3
import json, os, subprocess
print("PGREP")
try:
    print(subprocess.check_output(["pgrep", "-af", "panel-migrate"], text=True))
except subprocess.CalledProcessError:
    print("none")
print("LOCK", os.path.exists("/tmp/nexlify-migrate-in-progress"))
print("LOG")
if os.path.exists("/tmp/xui-preview.log"):
    print(open("/tmp/xui-preview.log").read()[-1500:])
print("JOB")
p = "/tmp/nexlify-migrate-job.json"
if os.path.exists(p):
    d = json.load(open(p))
    print("status", d.get("status"))
    print("message", d.get("message"))
    print("progress", d.get("progress"))
    print("error", d.get("error"))
    prev = d.get("preview")
    if prev:
        print("preview_counts", json.dumps(prev.get("counts") if isinstance(prev, dict) else prev, default=str)[:2000])
