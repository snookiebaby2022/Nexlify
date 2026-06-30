# Fix nexlify.live and panel.nexlify.live

## What went wrong

Both hostnames were proxying to the **same** Node process (the license/marketing site). That site returns **500** on `/` but **200** on `/login`. The IPTV panel (`nexlify-panel` repo) was not bound to `panel.nexlify.live`.

## Target layout

| URL | App | Port |
|-----|-----|------|
| https://panel.nexlify.live | IPTV panel (this repo) | 127.0.0.1:3000 |
| https://nexlify.live | Marketing / licenses | 127.0.0.1:3001 |

Nginx on **443** terminates TLS and routes by `server_name`.

## One command on the VPS

From `/home/nexlify-panel` (or your panel path):

```bash
sudo bash scripts/vps-fix-both-sites.sh
```

Set marketing path if not `/home/nexlify-web`:

```bash
sudo MARKETING_ROOT=/path/to/marketing bash scripts/vps-fix-both-sites.sh
```

## After deploy from Windows

```powershell
.\windows\scripts\deploy-from-windows.ps1
# Then SSH:
sudo bash /home/nexlify-panel/scripts/vps-fix-both-sites.sh
```

## Verify

```bash
curl -s http://127.0.0.1:3000/api/health
curl -sI http://127.0.0.1:3000/login | head -3
curl -sI http://127.0.0.1:3001/ | head -3
```

Public:

- https://panel.nexlify.live/login — IPTV admin login
- https://nexlify.live/ — marketing home (fix 500 in marketing repo if it persists)

## Cloudflare

Use **Full (strict)** only when Let's Encrypt certs exist on the VPS for both names. If you see **526**, use **Full** or fix origin certs:

```bash
sudo certbot certonly --nginx -d panel.nexlify.live
sudo certbot certonly --nginx -d nexlify.live -d www.nexlify.live
```

## Marketing home 500

That error is in the **marketing** Next.js project (not this panel). Check `pm2 logs nexlify-web` and rebuild that app. Splitting nginx does not fix a bug inside the marketing homepage.
