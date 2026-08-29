/** Shared SSH + at-rest decrypt helpers for 10gbs remote ops (pure CJS). */
const { createDecipheriv, createHash } = require("crypto");

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function keyBytes() {
  const raw =
    process.env.ENCRYPTION_AT_REST_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.LICENSE_SESSION_SECRET?.trim();
  if (!raw || raw === "dev-secret-change-me" || raw.length < 16) {
    throw new Error("Set ENCRYPTION_AT_REST_KEY or JWT_SECRET for encrypted storage");
  }
  return createHash("sha256").update(raw).digest();
}

function decryptAtRest(stored) {
  const value = String(stored || "").trim();
  if (!value.startsWith(PREFIX)) return value;
  const key = keyBytes();
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

async function get10gbsServer(prisma) {
  const server = await prisma.streamServer.findFirst({ where: { name: "10gbs" } });
  if (!server) throw new Error("10gbs stream server row missing");
  if (!server.agentSshPasswordEnc) {
    throw new Error("10gbs has no SSH password — set in Admin → Servers");
  }
  return {
    server,
    host: server.agentSshHost || server.host,
    port: server.agentSshPort || 22,
    user: server.agentSshUser || "root",
    password: decryptAtRest(server.agentSshPasswordEnc),
  };
}

async function withSshClient(input, fn) {
  const { Client } = require("ssh2");
  const host = String(input.host || "").trim();
  const port = Math.max(1, Math.min(65535, Number(input.port ?? 22) || 22));
  const username = String(input.username ?? "root").trim() || "root";
  const password = String(input.password ?? "");
  if (!host) throw new Error("SSH host is required");
  if (!password) throw new Error("SSH password is required");

  const conn = new Client();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        conn.end();
      } catch {
        /* ignore */
      }
      reject(new Error("SSH login timed out"));
    }, 20_000);
    conn
      .on("ready", () => {
        clearTimeout(timer);
        resolve();
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      })
      .connect({ host, port, username, password, readyTimeout: 15_000, tryKeyboard: false });
  });

  try {
    return await fn(conn);
  } finally {
    try {
      conn.end();
    } catch {
      /* ignore */
    }
  }
}

function sshExec(client, command, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`SSH command timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      let code = 0;
      stream.on("data", (buf) => {
        stdout += Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
      });
      stream.stderr.on("data", (buf) => {
        stderr += Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
      });
      stream.on("exit", (exitCode) => {
        if (typeof exitCode === "number") code = exitCode;
      });
      stream.on("close", () => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
      if (opts.stdin != null) {
        stream.write(opts.stdin);
        stream.end();
      }
    });
  });
}

module.exports = { decryptAtRest, get10gbsServer, withSshClient, sshExec };
