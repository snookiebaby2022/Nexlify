import { spawn } from "child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from "fs";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";

export type PgDumpTarget = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

/** Prisma/client params that libpq and pg_dump reject. */
const PRISMA_ONLY_PARAMS = new Set([
  "schema",
  "connection_limit",
  "pool_timeout",
  "socket_timeout",
  "pgbouncer",
]);

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const VERSIONED_PG_BIN_ROOT = "/usr/lib/postgresql";

export function postgresBinSearchPath(existing = process.env.PATH || ""): string {
  const extra = [
    "/usr/local/bin",
    "/usr/lib/postgresql/18/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/lib/postgresql/15/bin",
    "/usr/lib/postgresql/14/bin",
    "/usr/lib/postgresql/13/bin",
    "/usr/bin",
    "/bin",
  ];
  return [...extra, existing].filter(Boolean).join(path.delimiter);
}

/** Strip secrets from pg_dump / exec error text before logging. */
export function sanitizePgDumpError(err: unknown): string {
  let msg = "";
  if (err && typeof err === "object") {
    const e = err as { message?: string; stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = e.stderr ? String(e.stderr) : "";
    const stdout = e.stdout ? String(e.stdout) : "";
    msg = [e.message || String(err), stderr, stdout].filter(Boolean).join(" ");
  } else {
    msg = String(err);
  }
  return msg
    .replace(/postgres(ql)?:\/\/[^@\s]+@/gi, "postgresql://***@")
    .replace(/PGPASSWORD=\S+/gi, "PGPASSWORD=***")
    .replace(/password[=:]\s*\S+/gi, "password=***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Parse DATABASE_URL for argv-based pg_dump (no URL on the shell).
 * Drops Prisma-only query params that make libpq abort.
 */
export function parseDatabaseUrl(raw: string): PgDumpTarget {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) throw new Error("DATABASE_URL is empty");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (!/^postgres(ql)?:$/i.test(url.protocol)) {
    throw new Error("DATABASE_URL must use postgresql://");
  }

  const params = url.searchParams;
  const host = url.hostname || params.get("host") || "localhost";
  const port = url.port || params.get("port") || "5432";
  const user = decodeUriComponentSafe(url.username || params.get("user") || "nexlify");
  const password = decodeUriComponentSafe(url.password || params.get("password") || "");
  const database =
    decodeURIComponent(url.pathname.replace(/^\//, "")).split("/")[0] ||
    params.get("dbname") ||
    "nexlify";

  for (const key of PRISMA_ONLY_PARAMS) {
    params.delete(key);
  }

  return {
    host: host.replace(/^\[|\]$/g, ""),
    port,
    user,
    password,
    database,
  };
}

export function resolvePgDumpBinary(): string {
  const envPath = process.env.PG_DUMP_PATH?.trim();
  if (envPath && existsSync(envPath)) return envPath;

  const versioned: { ver: number; file: string }[] = [];
  try {
    if (existsSync(VERSIONED_PG_BIN_ROOT)) {
      for (const name of readdirSync(VERSIONED_PG_BIN_ROOT)) {
        const file = path.join(VERSIONED_PG_BIN_ROOT, name, "bin", "pg_dump");
        const ver = parseInt(name, 10);
        if (Number.isFinite(ver) && existsSync(file)) versioned.push({ ver, file });
      }
    }
  } catch {
    /* skip */
  }
  versioned.sort((a, b) => b.ver - a.ver);
  if (versioned[0]) return versioned[0].file;

  for (const candidate of ["/usr/local/bin/pg_dump", "/usr/bin/pg_dump"]) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "pg_dump not found. Install postgresql-client (apt-get install -y postgresql-client) or set PG_DUMP_PATH."
  );
}

export function resolvePgDumpDir(explicit?: string): string {
  const fromArg = explicit?.trim();
  if (fromArg) return fromArg;
  const fromEnv = process.env.PG_DUMP_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(resolvePanelRepoPathSync(), "backups", "pg");
}

export function cleanupOldPgDumps(dir: string, keepDays: number): number {
  if (!keepDays || keepDays < 1 || !existsSync(dir)) return 0;
  const cutoff = Date.now() - keepDays * 86400000;
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith("nexlify-pg-") || !name.endsWith(".sql.gz")) continue;
      const full = path.join(dir, name);
      try {
        if (statSync(full).mtimeMs < cutoff) {
          unlinkSync(full);
          removed++;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* best effort */
  }
  return removed;
}

function acquireDumpLock(dir: string): number {
  mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, ".pg_dump.lock");
  const tryOpen = () => openSync(lockPath, "wx");
  try {
    const fd = tryOpen();
    writeSync(fd, String(process.pid));
    return fd;
  } catch {
    try {
      const st = statSync(lockPath);
      if (Date.now() - st.mtimeMs > 3 * 60 * 60 * 1000) {
        unlinkSync(lockPath);
        const fd = tryOpen();
        writeSync(fd, String(process.pid));
        return fd;
      }
    } catch {
      /* still locked */
    }
    throw new Error("pg_dump already running (lock file present)");
  }
}

function releaseDumpLock(dir: string, fd: number) {
  try {
    closeSync(fd);
  } catch {
    /* */
  }
  try {
    unlinkSync(path.join(dir, ".pg_dump.lock"));
  } catch {
    /* */
  }
}

export async function runPgDumpToGzip(opts?: {
  databaseUrl?: string;
  outDir?: string;
  outPath?: string;
  timeoutMs?: number;
}): Promise<{ outPath: string; bytes: number; pgDumpPath: string; dir: string }> {
  const databaseUrl = (opts?.databaseUrl || process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const target = parseDatabaseUrl(databaseUrl);
  const pgDumpPath = resolvePgDumpBinary();
  const dir = resolvePgDumpDir(opts?.outDir);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = opts?.outPath || path.join(dir, `nexlify-pg-${stamp}.sql.gz`);
  const timeoutMs = opts?.timeoutMs ?? 2 * 60 * 60 * 1000;

  const lockFd = acquireDumpLock(dir);
  try {
    await dumpToGzipFile({ target, pgDumpPath, outPath, timeoutMs });
    const bytes = statSync(outPath).size;
    if (bytes < 50) {
      try {
        unlinkSync(outPath);
      } catch {
        /* */
      }
      throw new Error(`pg_dump produced an empty archive (${bytes} bytes)`);
    }
    return { outPath, bytes, pgDumpPath, dir };
  } finally {
    releaseDumpLock(dir, lockFd);
  }
}

function dumpToGzipFile(args: {
  target: PgDumpTarget;
  pgDumpPath: string;
  outPath: string;
  timeoutMs: number;
}): Promise<void> {
  const { target, pgDumpPath, outPath, timeoutMs } = args;
  const dumpArgs = [
    "-h",
    target.host,
    "-p",
    target.port,
    "-U",
    target.user,
    "-d",
    target.database,
    "--no-owner",
    "--no-acl",
    "--no-password",
  ];
  const env = {
    ...process.env,
    PATH: postgresBinSearchPath(),
    PGPASSWORD: target.password,
    PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || "30",
  };

  return new Promise((resolve, reject) => {
    const child = spawn(pgDumpPath, dumpArgs, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const gzip = createGzip({ level: 9 });
    const out = createWriteStream(outPath);
    let stderr = "";
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* */
        }
        try {
          unlinkSync(outPath);
        } catch {
          /* */
        }
        reject(err);
        return;
      }
      resolve();
    };

    const timer = setTimeout(() => {
      finish(new Error(`pg_dump timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (err) => {
      finish(new Error(sanitizePgDumpError(err.message || "failed to spawn pg_dump")));
    });

    let dumpCode: number | null = null;
    child.on("close", (code) => {
      dumpCode = code;
    });

    pipeline(child.stdout!, gzip, out)
      .then(() => {
        if (dumpCode !== 0 && dumpCode !== null) {
          finish(new Error(sanitizePgDumpError(stderr || `pg_dump exited ${dumpCode}`)));
          return;
        }
        // close may still be pending
        if (dumpCode === null) {
          child.once("close", (code) => {
            if (code !== 0) {
              finish(new Error(sanitizePgDumpError(stderr || `pg_dump exited ${code}`)));
            } else {
              finish();
            }
          });
          return;
        }
        finish();
      })
      .catch((err) => {
        finish(new Error(sanitizePgDumpError(stderr || String(err))));
      });
  });
}
