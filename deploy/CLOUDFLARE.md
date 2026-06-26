# Cloudflare proxy (orange cloud) for nexlify.live

## Permanent fix (after every deploy)

`deploy/remote-update.sh` now runs **`ensure-site.sh`** automatically (app on :3001 + panel subdomain SSL + full HTTPS nginx proxy — fixes **502** and **526**).

### Error 526 on `panel.nexlify.live`

Cloudflare **Full (strict)** requires a valid origin cert **per hostname**. If only `nexlify.live` is enabled in nginx, the panel subdomain gets the wrong certificate → **526 Invalid SSL certificate**.

**Fix:** `bash /var/www/nexlify/deploy/ensure-panel-ssl.sh` (also run from `ensure-site.sh`). Keeps `/etc/nginx/sites-enabled/panel.nexlify.live` with `/etc/letsencrypt/live/panel.nexlify.live/`.

Verify:

```bash
echo | openssl s_client -connect 127.0.0.1:443 -servername panel.nexlify.live 2>/dev/null | openssl x509 -noout -subject
# subject=CN = panel.nexlify.live
```

Manual repair on VPS:

```bash
bash /var/www/nexlify/deploy/ensure-site.sh
```

From Windows after deploy:

```powershell
ssh root@85.17.162.54 "bash /var/www/nexlify/deploy/ensure-site.sh"
```

---

## Symptom

With proxy **enabled**, the site shows:

- **Too many redirects** / endless loading
- Works when proxy is **DNS only** (grey cloud)

## Cause

**Flexible SSL** (default): Cloudflare talks to your VPS over **HTTP on port 80**.  
Certbot/nginx on port 80 redirects everything to **HTTPS**. Cloudflare follows that in a loop.

## Fix (do both)

### 1. Cloudflare dashboard

**SSL/TLS → Overview → Encryption mode:**

| Mode | Use |
|------|-----|
| **Full (strict)** | **Recommended** — Cloudflare → your VPS on HTTPS :443 (needs certbot cert on origin) |
| Full | OK if origin cert is valid |
| Flexible | **Avoid** with HTTPS redirects on origin |

Also check:

- **SSL/TLS → Edge Certificates → Always Use HTTPS**: ON is fine **after** origin is fixed
- **Rules**: disable any extra “redirect to HTTPS” page rules that duplicate origin redirects

### WAF (recommended)

After SSL is stable:

| Setting | Location | Recommendation |
|---------|----------|----------------|
| Managed rules | Security → WAF | **ON** (Cloudflare Free includes basic managed rulesets) |
| Bot Fight Mode | Security → Bots | **ON** for marketing site; test panel API if you use automation |
| Browser Integrity Check | Security → Settings | **ON** |
| Rate limiting | Security → WAF → Rate limiting | Optional rule on `/login`, `/api/auth/*` |

Origin also sends HSTS + security headers via `deploy/nginx-security-headers.conf` (applied by `ensure-security-hardening.sh`).

Full security checklist: `deploy/SECURITY.md`

### 2. VPS nginx (Flexible SSL fallback)

Updates port 80 so requests with `X-Forwarded-Proto: https` (from Cloudflare) are **proxied**, not redirected:

```bash
bash /var/www/nexlify/deploy/fix-cloudflare.sh
```

Then **Caching → Purge Everything**.

## Verify

```bash
# Simulate Cloudflare hitting origin on port 80
curl -sI -H "Host: nexlify.live" -H "X-Forwarded-Proto: https" http://127.0.0.1/ | head -3
# Expect: HTTP/1.1 200

curl -sI https://nexlify.live/ | head -3
# Expect: HTTP/2 200 (via Cloudflare)
```

## Panel

| URL | Notes |
|-----|--------|
| `https://panel.nexlify.live/` | Dedicated vhost + cert (`ensure-panel-ssl.sh`) |
| `https://panel.demo.nexlify.live/` | **Double subdomain** — not covered by Cloudflare `*.nexlify.live` edge cert. Use **DNS only** (grey cloud) → `85.17.162.54`, or enable **Total TLS** / Advanced Certificate for `panel.demo.nexlify.live`. Origin cert: `ensure-panel-demo-live.sh` |
| `https://billing.nexlify.live/` | WHMCS — own origin cert (`ensure-billing-ssl.sh`; runs with `ensure-site.sh`) |
| `https://nexlify.live/panel/` | Proxied on main site; may redirect to panel subdomain |

IPTV app listens on **127.0.0.1:3000**. Website on **3001**. Upstreams: `deploy/nginx-upstream.conf`.
