#!/usr/bin/env bash
# Fill missing JWT_SECRET / DATABASE_URL / REDIS_URL in panel .env from PM2 dump
# or running apps. Never prints secret values. Does not rotate an existing JWT.
set -euo pipefail
ROOT="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
ENVF="$ROOT/.env"
DUMP="${PM2_DUMP:-/root/.pm2/dump.pm2}"
touch "$ENVF"
chmod 600 "$ENVF" 2>/dev/null || true

python3 - "$ENVF" "$DUMP" <<'PY'
import json, os, re, subprocess, sys

envf, dump_path = sys.argv[1], sys.argv[2]
KEYS = ("JWT_SECRET", "DATABASE_URL", "REDIS_URL")

def parse_env(text: str) -> dict[str, str]:
    out = {}
    for line in text.splitlines():
        t = line.strip()
        if not t or t.startswith("#") or "=" not in t:
            continue
        if t.startswith("export "):
            t = t[7:].strip()
        k, v = t.split("=", 1)
        k, v = k.strip(), v.strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        if k:
            out[k] = v
    return out

def set_kv(text: str, key: str, val: str) -> str:
    if any(c in val for c in " \t#") or val.startswith('"'):
        q = val.replace("\\", "\\\\").replace('"', '\\"')
        line = f'{key}="{q}"'
    else:
        line = f"{key}={val}"
    if re.search(rf"^{re.escape(key)}=", text, re.M):
        return re.sub(rf"^{re.escape(key)}=.*$", line, text, count=1, flags=re.M)
    if text and not text.endswith("\n"):
        text += "\n"
    return text + line + "\n"

def collect_from_pm2_dump(path: str) -> dict[str, str]:
    found: dict[str, str] = {}
    if not os.path.isfile(path):
        return found
    try:
        data = json.loads(open(path, encoding="utf-8").read())
    except Exception:
        return found
    apps = data if isinstance(data, list) else []
    prefer = ("nexlify", "nexlify-cron")
    ranked = []
    for item in apps:
        if not isinstance(item, dict):
            continue
        env = item.get("env") or {}
        pm2env = item.get("pm2_env") or {}
        name = item.get("name") or pm2env.get("name") or ""
        merged = {}
        if isinstance(pm2env, dict):
            merged.update({k: pm2env.get(k) for k in KEYS})
        if isinstance(env, dict):
            merged.update({k: env.get(k) for k in KEYS})
        ranked.append((0 if name in prefer else 1, name, merged))
    ranked.sort()
    for _, _, merged in ranked:
        for k in KEYS:
            v = str(merged.get(k) or "").strip()
            if v and k not in found:
                found[k] = v
    return found

def collect_from_jlist() -> dict[str, str]:
    found: dict[str, str] = {}
    try:
        data = json.loads(subprocess.check_output(["pm2", "jlist"], text=True))
    except Exception:
        return found
    for item in data:
        env = (item.get("pm2_env") or {})
        name = item.get("name") or env.get("name")
        for k in KEYS:
            v = str(env.get(k) or "").strip()
            if v and k not in found:
                found[k] = v
        if name == "nexlify-cron":
            for k in KEYS:
                v = str(env.get(k) or "").strip()
                if v:
                    found[k] = v
    return found

text = open(envf, encoding="utf-8", errors="replace").read() if os.path.isfile(envf) else ""
cur = parse_env(text)
src = collect_from_pm2_dump(dump_path)
src.update({k: v for k, v in collect_from_jlist().items() if v})

# bak files (never overwrite a present value)
bak_dir = os.path.dirname(envf)
for name in os.listdir(bak_dir) if os.path.isdir(bak_dir) else []:
    if not name.startswith(".env.bak"):
        continue
    try:
        bak = parse_env(open(os.path.join(bak_dir, name), encoding="utf-8", errors="replace").read())
    except Exception:
        continue
    for k in KEYS:
        if k not in src and bak.get(k, "").strip():
            src[k] = bak[k].strip()

added = []
for k in KEYS:
    if str(cur.get(k) or "").strip():
        continue
    v = str(src.get(k) or "").strip()
    if not v:
        print(f"missing_{k.lower()}=1")
        continue
    text = set_kv(text, k, v)
    added.append(k)
    print(f"restored_{k.lower()}=1")

if added:
    bak = envf + ".bak.pre-secret-restore"
    if not os.path.isfile(bak):
        open(bak, "w", encoding="utf-8").write(open(envf, encoding="utf-8", errors="replace").read() if os.path.isfile(envf) else "")
    open(envf, "w", encoding="utf-8").write(text)
    try:
        os.chmod(envf, 0o600)
    except Exception:
        pass
    print("added=" + ",".join(added))
else:
    print("added=none")
PY
