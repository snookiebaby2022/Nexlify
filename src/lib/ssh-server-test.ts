import { Socket } from "node:net";
import { extractHostname } from "@/lib/ip-country";

export type SshTestInput = {
  host: string;
  port?: number;
  username?: string;
  password?: string;
};

export type SshTestResult = {
  ok: boolean;
  message: string;
  banner?: string;
};

function sshBanner(host: string, port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = new Socket();
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`No SSH banner on ${host}:${port}`));
    }, timeoutMs);
    sock.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    sock.connect(port, host, () => {
      sock.once("data", (buf) => {
        clearTimeout(timer);
        const line = buf.toString("utf8").split(/\r?\n/)[0]?.trim() ?? "";
        sock.destroy();
        resolve(line);
      });
    });
  });
}

export async function testStreamServerSsh(input: SshTestInput): Promise<SshTestResult> {
  const host = extractHostname(input.host) ?? input.host.trim();
  const port = Math.max(1, Math.min(65535, Number(input.port ?? 22) || 22));
  const username = String(input.username ?? "root").trim() || "root";
  const password = String(input.password ?? "");
  if (!host) return { ok: false, message: "SSH host is required" };
  if (!password) return { ok: false, message: "SSH password is required to test login" };

  let banner = "";
  try {
    banner = await sshBanner(host, port, 5000);
    if (!/^SSH-/i.test(banner)) {
      return { ok: false, message: `Port ${port} is open but is not SSH (${banner || "no banner"})` };
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : `Cannot reach ${host}:${port}`,
    };
  }

  try {
    const { Client } = await import("ssh2");
    const result = await new Promise<SshTestResult>((resolve) => {
      const conn = new Client();
      const done = (out: SshTestResult) => {
        try {
          conn.end();
        } catch {
          /* ignore */
        }
        resolve(out);
      };
      const timer = setTimeout(() => {
        done({ ok: false, message: "SSH login timed out", banner });
      }, 10_000);
      conn
        .on("ready", () => {
          clearTimeout(timer);
          conn.exec("echo nexlify-ssh-ok", (err, stream) => {
            if (err) {
              done({ ok: true, message: `SSH login as ${username} succeeded`, banner });
              return;
            }
            stream
              .on("close", () => {
                done({
                  ok: true,
                  message: `SSH login as ${username}@${host}:${port} succeeded`,
                  banner,
                });
              })
              .resume();
          });
        })
        .on("error", (err) => {
          clearTimeout(timer);
          const msg = err instanceof Error ? err.message : String(err);
          done({ ok: false, message: msg.replace(/^All configured authentication methods failed$/, "SSH username or password is wrong"), banner });
        })
        .connect({
          host,
          port,
          username,
          password,
          readyTimeout: 8000,
          tryKeyboard: false,
        });
    });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Cannot find module ['"]ssh2['"]/.test(msg)) {
      return {
        ok: false,
        message: `SSH port is open (${banner}) but the ssh2 package is not installed — run npm install ssh2`,
        banner,
      };
    }
    return { ok: false, message: msg, banner };
  }
}
