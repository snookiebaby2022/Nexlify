import { decryptAtRest } from "@/lib/encryption-at-rest";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import { issueLetsEncryptCertificate, readLetsEncryptCertExpiry, type CertbotIssueResult } from "@/lib/certbot-run";
import {
  parseOpenSslEndDateLine,
  pickCertbotEmail,
  type LetsEncryptCertExpiry,
} from "@/lib/certbot-utils";
import { withSshClient, sshExec } from "@/lib/ssh-exec";
import type { StreamServer } from "@prisma/client";

export type ServerCertIssueResult = CertbotIssueResult & {
  remote?: boolean;
  expiry?: LetsEncryptCertExpiry | null;
};

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function serverSshTarget(server: StreamServer) {
  const host = server.agentSshHost || server.host;
  const user = server.agentSshUser || "root";
  const port = server.agentSshPort || 22;
  return { host, user, port };
}

async function serverSshPassword(server: StreamServer): Promise<string | { error: string }> {
  if (!server.agentUseSsh) {
    return { error: "Enable SSH on this server to run Certbot on a remote LB" };
  }
  try {
    const password = server.agentSshPasswordEnc ? decryptAtRest(server.agentSshPasswordEnc) : "";
    if (!password) return { error: "SSH password required for remote Certbot" };
    return password;
  } catch {
    return { error: "Cannot decrypt SSH password" };
  }
}

function remoteCertbotScript(domain: string, contactEmail: string): string {
  const d = shellSingleQuote(domain);
  const emailArgs = contactEmail
    ? `--email ${shellSingleQuote(contactEmail)}`
    : "--register-unsafely-without-email";
  return [
    `DOMAIN=${d}`,
    'CB=$(command -v certbot 2>/dev/null || true)',
    '[ -x /home/nexlify/bin/certbot/bin/certbot ] && CB=/home/nexlify/bin/certbot/bin/certbot',
    '[ -n "$CB" ] || { echo "CERTBOT_OK=0"; echo "Certbot not found on remote host"; exit 2; }',
    `if $CB certonly --non-interactive --agree-tos --keep-until-expiring ${emailArgs} --nginx -d "$DOMAIN"; then`,
    "  echo CERTBOT_OK=1",
    `elif $CB certonly --non-interactive --agree-tos --keep-until-expiring ${emailArgs} --webroot -w /var/www/html -d "$DOMAIN"; then`,
    "  echo CERTBOT_OK=1",
    "else",
    "  echo CERTBOT_OK=0",
    "  exit 1",
    "fi",
    "nginx -t 2>/dev/null && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true) || true",
  ].join("\n");
}

function remoteExpiryScript(domain: string): string {
  const chain = shellSingleQuote(`/etc/letsencrypt/live/${domain}/fullchain.pem`);
  return `openssl x509 -enddate -noout -in ${chain} 2>/dev/null || true`;
}

async function issueRemote(
  server: StreamServer,
  domain: string,
  contactEmail: string
): Promise<CertbotIssueResult> {
  const creds = await serverSshPassword(server);
  if (typeof creds !== "string") {
    return { ok: false, message: creds.error };
  }
  const { host, port, user } = serverSshTarget(server);
  const script = remoteCertbotScript(domain, contactEmail);
  try {
    const result = await withSshClient(
      { host, port, username: user, password: creds },
      async (client) => sshExec(client, `bash -lc ${JSON.stringify(script)}`, { timeoutMs: 300_000 })
    );
    const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    const ok = result.code === 0 && /CERTBOT_OK=1/.test(out);
    const paths = {
      certFullChainPath: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
      certKeyPath: `/etc/letsencrypt/live/${domain}/privkey.pem`,
    };
    return {
      ok,
      message: ok
        ? "Let's Encrypt certificate issued on remote LB (Certbot). Nginx reloaded when available."
        : "Remote Certbot failed. Check DNS, port 80, and nginx on the LB.",
      ...paths,
      log: out.slice(-4000),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "SSH Certbot failed",
    };
  }
}

async function expiryRemote(server: StreamServer, domain: string): Promise<LetsEncryptCertExpiry> {
  const creds = await serverSshPassword(server);
  if (typeof creds !== "string") {
    return { expiresAt: null, daysLeft: null, error: creds.error };
  }
  const { host, port, user } = serverSshTarget(server);
  try {
    const result = await withSshClient(
      { host, port, username: user, password: creds },
      async (client) =>
        sshExec(client, `bash -lc ${JSON.stringify(remoteExpiryScript(domain))}`, { timeoutMs: 30_000 })
    );
    const line = `${result.stdout || ""}`.trim();
    return parseOpenSslEndDateLine(line);
  } catch (e) {
    return {
      expiresAt: null,
      daysLeft: null,
      error: e instanceof Error ? e.message : "SSH cert read failed",
    };
  }
}

export async function issueServerLetsEncryptCertificate(
  server: StreamServer,
  email?: string | null
): Promise<ServerCertIssueResult> {
  const domain = String(server.domain ?? "").trim().toLowerCase();
  if (!domain) {
    return { ok: false, message: "Set a domain on this server before issuing a certificate." };
  }

  const contactEmail = pickCertbotEmail([
    email,
    process.env.NEXLIFY_CERTBOT_EMAIL,
    process.env.CERTBOT_EMAIL,
  ]);

  const result = isThisPanelMachine(server)
    ? await issueLetsEncryptCertificate([domain], contactEmail || undefined)
    : await issueRemote(server, domain, contactEmail);

  const expiry = result.ok
    ? isThisPanelMachine(server)
      ? await readLetsEncryptCertExpiry(domain)
      : await expiryRemote(server, domain)
    : null;

  return {
    ...result,
    remote: !isThisPanelMachine(server),
    expiry,
  };
}

export async function getServerLetsEncryptCertStatus(
  server: StreamServer,
  domain: string
): Promise<
  LetsEncryptCertExpiry & {
    fullChainPath: string;
    remote?: boolean;
    renewHint?: string;
  }
> {
  const d = domain.trim().toLowerCase();
  const fullChainPath = `/etc/letsencrypt/live/${d}/fullchain.pem`;
  const base = isThisPanelMachine(server)
    ? await readLetsEncryptCertExpiry(d)
    : await expiryRemote(server, d);

  let renewHint: string | undefined;
  if (base.daysLeft != null) {
    if (base.daysLeft < 0) renewHint = "Expired — re-issue or run certbot renew on the host.";
    else if (base.daysLeft <= 14) renewHint = "Renew soon (certbot renew runs on the VPS via systemd timer).";
    else renewHint = "System certbot renew timer should extend this before expiry.";
  } else if (!base.error) {
    renewHint = "No certificate on disk yet for this domain.";
  }

  return {
    ...base,
    fullChainPath,
    remote: !isThisPanelMachine(server),
    renewHint,
  };
}
