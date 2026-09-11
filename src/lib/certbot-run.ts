import { spawn } from "child_process";
import { access } from "fs/promises";
import { constants } from "fs";
import { getBinPaths } from "@/lib/bin-paths";
import {
  letsEncryptLivePaths,
  parseOpenSslEndDateLine,
  pickCertbotEmail,
  type LetsEncryptCertExpiry,
} from "@/lib/certbot-utils";

export { pickCertbotEmail, parseOpenSslEndDateLine, letsEncryptLivePaths, type LetsEncryptCertExpiry } from "@/lib/certbot-utils";

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

function runProcess(
  cmd: string,
  args: string[],
  timeoutMs = 300_000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Certbot timed out after 5 minutes"));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export type CertbotIssueResult = {
  ok: boolean;
  message: string;
  certFullChainPath?: string;
  certKeyPath?: string;
  log?: string;
};

/** Read LE cert expiry from local disk (panel/LB host). */
export async function readLetsEncryptCertExpiry(domain: string): Promise<LetsEncryptCertExpiry> {
  const { certFullChainPath } = letsEncryptLivePaths(domain);
  try {
    const { stdout } = await runProcess(
      "openssl",
      ["x509", "-enddate", "-noout", "-in", certFullChainPath],
      15_000
    );
    return parseOpenSslEndDateLine(String(stdout));
  } catch {
    return { expiresAt: null, daysLeft: null, error: "No Let's Encrypt certificate file for this domain yet" };
  }
}

async function reloadNginxIfPresent(): Promise<void> {
  try {
    await runProcess(
      "bash",
      [
        "-lc",
        "nginx -t 2>/dev/null && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || nginx -s reload 2>/dev/null || true)",
      ],
      30_000
    );
  } catch {
    /* optional */
  }
}

export async function issueLetsEncryptCertificate(
  domains: string[],
  email?: string | null
): Promise<CertbotIssueResult> {
  if (process.platform !== "linux") {
    return {
      ok: false,
      message:
        "Let's Encrypt via certbot is only supported on Linux production VPS. On Windows dev, configure nginx and certbot manually (see deployment notes).",
    };
  }

  if (!domains.length) {
    return { ok: false, message: "At least one domain is required." };
  }

  const contactEmail = pickCertbotEmail(
    email,
    process.env.NEXLIFY_CERTBOT_EMAIL,
    process.env.CERTBOT_EMAIL
  );

  const { certbotPath } = await getBinPaths();
  if (!(await executable(certbotPath))) {
    return {
      ok: false,
      message: `Certbot not found or not executable at ${certbotPath}. Set the path under Settings → Server binaries.`,
    };
  }

  const primary = domains[0];
  const baseArgs = [
    "certonly",
    "--non-interactive",
    "--agree-tos",
    "--keep-until-expiring",
  ];
  if (contactEmail) {
    baseArgs.push("--email", contactEmail);
  } else {
    baseArgs.push("--register-unsafely-without-email");
  }
  const domainArgs = domains.flatMap((d) => ["-d", d]);

  const attempts: { mode: string; args: string[] }[] = [
    { mode: "nginx", args: [...baseArgs, "--nginx", ...domainArgs] },
    {
      mode: "webroot",
      args: [
        ...baseArgs,
        "--webroot",
        "-w",
        "/var/www/html",
        ...domainArgs,
      ],
    },
  ];

  let lastLog = "";
  for (const attempt of attempts) {
    const { code, stdout, stderr } = await runProcess(certbotPath, attempt.args);
    lastLog = [stdout, stderr].filter(Boolean).join("\n").trim();
    if (code === 0) {
      await reloadNginxIfPresent();
      const certFullChainPath = `/etc/letsencrypt/live/${primary}/fullchain.pem`;
      const certKeyPath = `/etc/letsencrypt/live/${primary}/privkey.pem`;
      return {
        ok: true,
        message: `Let's Encrypt certificate issued (${attempt.mode}). Nginx reloaded when available.`,
        certFullChainPath,
        certKeyPath,
        log: lastLog.slice(-4000),
      };
    }
  }

  return {
    ok: false,
    message:
      "Certbot failed. Ensure DNS points to this server, port 80 is reachable, and nginx (or /var/www/html for webroot) is configured. See certbot log in settings.",
    log: lastLog.slice(-4000),
  };
}
