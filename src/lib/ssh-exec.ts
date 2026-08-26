import { extractHostname } from "@/lib/ip-country";
import type { SshTestInput } from "@/lib/ssh-server-test";

export type SshExecResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function connectOpts(input: SshTestInput) {
  const host = extractHostname(input.host) ?? input.host.trim();
  const port = Math.max(1, Math.min(65535, Number(input.port ?? 22) || 22));
  const username = String(input.username ?? "root").trim() || "root";
  const password = String(input.password ?? "");
  return { host, port, username, password };
}

export type Ssh2Client = {
  on: (ev: string, fn: (...args: unknown[]) => void) => Ssh2Client;
  exec: (
    command: string,
    cb: (err: Error | undefined, stream: Ssh2ExecStream) => void
  ) => void;
  end: () => void;
};

type Ssh2ExecStream = NodeJS.ReadableStream & {
  stderr: NodeJS.ReadableStream;
  on: (ev: string, fn: (...args: unknown[]) => void) => Ssh2ExecStream;
};

export async function withSshClient<T>(
  input: SshTestInput,
  fn: (client: Ssh2Client) => Promise<T>
): Promise<T> {
  const { host, port, username, password } = connectOpts(input);
  if (!host) throw new Error("SSH host is required");
  if (!password) throw new Error("SSH password is required");

  const { Client } = await import("ssh2");
  const conn = new Client() as unknown as Ssh2Client;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        conn.end();
      } catch {
        /* ignore */
      }
      reject(new Error("SSH login timed out"));
    }, 15_000);
    conn
      .on("ready", () => {
        clearTimeout(timer);
        resolve();
      })
      .on("error", (err: unknown) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        reject(
          new Error(
            msg.replace(
              /^All configured authentication methods failed$/,
              "SSH username or password is wrong"
            )
          )
        );
      });
    (conn as unknown as { connect: (opts: Record<string, unknown>) => void }).connect({
      host,
      port,
      username,
      password,
      readyTimeout: 12_000,
      tryKeyboard: false,
    });
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

export async function sshExec(
  client: Ssh2Client,
  command: string,
  opts?: {
    stdin?: string;
    timeoutMs?: number;
    onData?: (chunk: string) => void;
  }
): Promise<SshExecResult> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
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
      const onChunk = (buf: unknown, which: "out" | "err") => {
        const text = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
        if (which === "out") stdout += text;
        else stderr += text;
        opts?.onData?.(text);
      };
      let code = 0;
      const ch = stream as Ssh2ExecStream & NodeJS.WritableStream;
      ch.on("data", (buf) => onChunk(buf, "out"));
      ch.stderr.on("data", (buf) => onChunk(buf, "err"));
      ch.on("error", (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
      ch.on("exit", (exitCode) => {
        if (typeof exitCode === "number") code = exitCode;
      });
      ch.on("close", () => {
        clearTimeout(timer);
        resolve({
          code,
          stdout,
          stderr,
        });
      });
      if (opts?.stdin != null) {
        ch.write(opts.stdin);
        ch.end();
      }
    });
  });
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
