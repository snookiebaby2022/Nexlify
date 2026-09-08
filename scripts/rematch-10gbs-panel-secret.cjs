#!/usr/bin/env node
/**
 * Copy this panel's PANEL_INTERNAL_SECRET onto 10gbs edge env and point
 * IPTV_EDGE_BACKEND at panel nginx :8080 (/api/internal → Next.js).
 * Does not start iptv-edge on the panel host.
 *
 * Run on 45: node scripts/rematch-10gbs-panel-secret.cjs
 * Dry check: NEXLIFY_DRY_RUN=1 node scripts/rematch-10gbs-panel-secret.cjs
 */
const crypto = require("crypto");
const { execSync } = require("child_process");
const path = require("path");

process.chdir(path.join(__dirname, ".."));
require("./load-env.cjs").loadEnv();

const { PrismaClient } = require("@prisma/client");
const { get10gbsServer, withSshClient, sshExec } = require("./ssh-10gbs-lib.cjs");

const PANEL_HOST = process.env.PANEL_PUBLIC_HOST || "45.88.138.18";
const PANEL_BACKEND = `${PANEL_HOST}:${process.env.PANEL_PUBLIC_PORT || process.env.STREAM_HTTP_PORT || "8080"}`;
const DRY = String(process.env.NEXLIFY_DRY_RUN || "") === "1";

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function pm2PanelSecret() {
  try {
    const list = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
    const p = list.find((x) => x.name === "nexlify");
    const e = p?.pm2_env?.env || {};
    return String(e.PANEL_INTERNAL_SECRET || e.PANEL_API_SECRET || e.NEXLIFY_PANEL_API_SECRET || "").trim();
  } catch {
    return "";
  }
}

function panelSecret() {
  return (
    process.env.PANEL_INTERNAL_SECRET ||
    process.env.PANEL_API_SECRET ||
    process.env.NEXLIFY_PANEL_API_SECRET ||
    pm2PanelSecret() ||
    ""
  );
}

const REMOTE_PY = `import hashlib, json, os, re, subprocess, sys

def grab_env(path, key):
    if not os.path.exists(path):
        return ""
    text = open(path, "r", encoding="utf-8", errors="replace").read()
    m = re.search(r"^" + re.escape(key) + r"=(.*)$", text, re.M)
    if not m:
        return ""
    v = m.group(1).strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    return v

def fp(v):
    return hashlib.sha256((v or "").encode()).hexdigest()[:12]

def pm2_env():
    try:
        return subprocess.check_output(["pm2", "env", "0"], text=True, stderr=subprocess.DEVNULL)
    except Exception:
        return ""

def parse_pm2(raw, key):
    prefix = key + ":"
    for line in raw.splitlines():
        if line.startswith(prefix):
            return line.split(":", 1)[1].strip()
    return ""

def upsert(src, key, val):
    line = key + "=" + val
    if re.search(r"^" + re.escape(key) + r"=", src, re.M):
        return re.sub(r"^" + re.escape(key) + r"=.*$", line, src, count=1, flags=re.M)
    return src.rstrip() + "\\n" + line + "\\n"

payload = json.load(sys.stdin)
path = "/opt/nexlify-panel/.env"
sec = grab_env(path, "PANEL_INTERNAL_SECRET")
backend = grab_env(path, "IPTV_EDGE_BACKEND")
raw = pm2_env()
pm2_sec = parse_pm2(raw, "PANEL_INTERNAL_SECRET")
pm2_backend = parse_pm2(raw, "IPTV_EDGE_BACKEND")
print("env backend=" + backend)
print("env secret len=" + str(len(sec)) + " hash=" + fp(sec))
print("pm2 backend=" + pm2_backend)
print("pm2 secret len=" + str(len(pm2_sec)) + " hash=" + fp(pm2_sec))
if payload.get("mode") != "apply":
    sys.exit(0)
secret = payload["secret"]
want_backend = payload["backend"]
text = open(path, "r", encoding="utf-8", errors="replace").read() if os.path.exists(path) else ""
for k, v in (
    ("PANEL_INTERNAL_SECRET", secret),
    ("PANEL_API_SECRET", secret),
    ("NEXLIFY_PANEL_API_SECRET", secret),
    ("IPTV_EDGE_BACKEND", want_backend),
):
    text = upsert(text, k, v)
open(path, "w", encoding="utf-8").write(text)
print("env_written")
`;

async function runRemote(c, payload) {
  const pyB64 = Buffer.from(REMOTE_PY, "utf8").toString("base64");
  const install = await sshExec(
    c,
    `python3 -c "import base64; open('/tmp/nl-rematch-10gbs.py','wb').write(base64.b64decode('${pyB64}'))"`
  );
  if (install.code !== 0) throw new Error(install.stderr || "upload rematch py failed");
  return sshExec(c, "python3 /tmp/nl-rematch-10gbs.py", {
    stdin: JSON.stringify(payload),
    timeoutMs: 60_000,
  });
}

async function main() {
  const secret = panelSecret().trim();
  if (!secret) throw new Error("PANEL_INTERNAL_SECRET missing");
  console.log(`panel secret len=${secret.length} hash=${fingerprint(secret)} backend=${PANEL_BACKEND}`);

  const prisma = new PrismaClient();
  try {
    const s = await get10gbsServer(prisma);
    await withSshClient({ host: s.host, port: s.port, username: s.user, password: s.password }, async (c) => {
      const probe = await runRemote(c, { mode: "probe" });
      process.stdout.write(probe.stdout || "");
      if (probe.stderr) process.stderr.write(probe.stderr);
      if (probe.code !== 0) throw new Error("10gbs probe failed");

      if (DRY) {
        console.log("DRY_RUN — no 10gbs env write / restart");
        return;
      }

      const apply = await runRemote(c, { mode: "apply", secret, backend: PANEL_BACKEND });
      process.stdout.write(apply.stdout || "");
      if (apply.code !== 0) throw new Error(apply.stderr || "10gbs .env write failed");

      const restart = await sshExec(
        c,
        "cd /opt/nexlify-panel && pm2 restart nexlify-iptv-edge --update-env && sleep 3 && pm2 env 0 2>/dev/null | grep '^IPTV_EDGE_BACKEND:' || true"
      );
      process.stdout.write(restart.stdout || "");
      if (restart.code !== 0) throw new Error(restart.stderr || "10gbs edge restart failed");
      console.log("10gbs_secret_rematch_ok");
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
