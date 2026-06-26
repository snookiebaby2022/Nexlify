# Nexlify security hardening

Security scripts run automatically on every deploy via `ensure-site.sh` → `ensure-security-hardening.sh`.

## Automatic (every deploy)

| Script | What it does |
|--------|----------------|
| `ensure-security-env.sh` | Strong `JWT_SECRET`, `ENCRYPTION_AT_REST_KEY`, `CRON_SECRET`; removes exposed demo creds from client env |
| `ensure-secrets-permissions.sh` | `chmod 600` on `.env` files; `chmod 700` on data dirs and `.license-keys` |
| `ensure-postgres-hardening.sh` | PostgreSQL config permissions; enables `pgcrypto` extension |
| `ensure-disk-encryption-audit.sh` | Detects LUKS; writes audit to `data/.disk-encryption-audit.json` |
| `nginx-security-headers.conf` | HSTS, X-Frame-Options, nosniff, Referrer-Policy on all HTTPS vhosts |

## Encryption layers

### In transit (HTTPS)
- Let's Encrypt on origin (nginx :443)
- Cloudflare **Full (strict)** recommended — see `deploy/CLOUDFLARE.md`

### Application layer
- **Passwords:** bcrypt (panel + marketing site)
- **Sessions:** signed JWT (`JWT_SECRET`)
- **License keys (panel DB):** AES-256-GCM (`ENCRYPTION_AT_REST_KEY`) — auto-migrates plain rows on read
- **License keys (customer):** Ed25519 signed payloads (cannot be forged)

### At rest (VPS disk)
- **Not automatic** on existing installs — enable one of:
  1. **Provider volume encryption** (recommended — check your VPS control panel)
  2. **LUKS encrypted data volume** for PostgreSQL + `/var/www/nexlify/data`
  3. Reinstall with encrypted root (disruptive)

Run audit:
```bash
bash /var/www/nexlify/deploy/ensure-disk-encryption-audit.sh
cat /var/www/nexlify/data/.disk-encryption-audit.json
```

## Cloudflare WAF (manual dashboard)

1. **SSL/TLS → Overview:** Full (strict)
2. **Security → WAF → Managed rules:** ON
3. **Security → Bots:** Bot Fight Mode ON (adjust if API clients break)
4. **Security → Settings:** Browser Integrity Check ON
5. Optional custom rule: challenge countries with high abuse rates
6. **Caching → Purge Everything** after each deploy

## Secrets checklist

- [ ] `.env` never in git (`.gitignore` covers this)
- [ ] `.license-keys/private.pem` never committed or shipped to customers
- [ ] SSH key auth only; disable password login on VPS
- [ ] `PANEL_OWNER_IPS` set for owner panel if desired
- [ ] Disable panel auto-update on patch VPS if you prefer manual `apply-panel-fast-update.sh`

## Manual repair

```bash
bash /var/www/nexlify/deploy/ensure-security-hardening.sh
bash /var/www/nexlify/deploy/ensure-site.sh
```

From Windows:
```powershell
ssh root@YOUR_VPS "bash /var/www/nexlify/deploy/ensure-security-hardening.sh"
```
