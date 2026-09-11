export type LetsEncryptCertExpiry = {
  expiresAt: string | null;
  daysLeft: number | null;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First valid contact email from panel settings, env, or legacy per-server value. */
export function pickCertbotEmail(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const e = String(c ?? "").trim();
    if (EMAIL_RE.test(e)) return e;
  }
  return "";
}

export function parseOpenSslEndDateLine(line: string): LetsEncryptCertExpiry {
  const m = /notAfter=(.+)/i.exec(String(line).trim());
  if (!m) {
    return {
      expiresAt: null,
      daysLeft: null,
      error: line.trim() ? line.trim() : "Certificate file not found",
    };
  }
  const expiresAt = new Date(m[1].trim());
  if (Number.isNaN(expiresAt.getTime())) {
    return { expiresAt: null, daysLeft: null, error: "Could not parse certificate expiry" };
  }
  const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
  return { expiresAt: expiresAt.toISOString(), daysLeft };
}

export function letsEncryptLivePaths(domain: string) {
  const d = domain.trim().toLowerCase();
  return {
    certFullChainPath: `/etc/letsencrypt/live/${d}/fullchain.pem`,
    certKeyPath: `/etc/letsencrypt/live/${d}/privkey.pem`,
  };
}
