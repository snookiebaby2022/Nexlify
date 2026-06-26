# Deploy from Windows → VPS (nexlify.live)

One command deploys the site to **85.17.162.54** (or your VPS).

| Service | Port |
|---------|------|
| Nexlify website | **3001** |
| IPTV panel | **3000** |
| Public HTTPS | **443** (nginx) |

---

## First time

### 1. SSH key (Windows PowerShell)

```powershell
cd C:\Users\lizzi\Projects\stream-billing
npm run setup:ssh
```

Type `y` when asked, enter your VPS **root password** once.

Or add your `.pub` key in the **VPS control panel** → SSH keys.

Test:

```powershell
ssh root@85.17.162.54 "echo OK"
```

### 2. DNS

| Host | Type | Value |
|------|------|--------|
| `nexlify.live` | A | `85.17.162.54` |
| `www` | A | `85.17.162.54` (optional, for SSL) |

### 3. Deploy

```powershell
cd C:\Users\lizzi\Projects\stream-billing
npm run deploy
```

Takes ~5–15 minutes (build on Linux).

### 4. HTTPS

```powershell
ssh root@85.17.162.54 "certbot --nginx -d nexlify.live"
```

Add `-d www.nexlify.live` only if `www` DNS exists.

---

## Commands

| Command | What it does |
|---------|----------------|
| `npm run deploy` | Full install / update on VPS |
| `npm run deploy -- -UpdateOnly` | Faster redeploy (skip apt) |
| `npm run deploy -- -ArchiveOnly` | Only create `nexlify-deploy.tar.gz` |
| `npm run setup:ssh` | Fix SSH key login |
| `npm run pack:vps` | Create archive only |

---

## No SSH? Manual upload

```powershell
npm run deploy -- -ArchiveOnly
```

1. Upload `nexlify-deploy.tar.gz` (project folder or `%TEMP%`) to VPS **`/tmp/`** via file manager.
2. Web console:

```bash
mkdir -p /var/www/nexlify
tar -xzf /tmp/nexlify-deploy.tar.gz -C /var/www/nexlify
bash /var/www/nexlify/deploy/remote-install.sh
```

---

## After deploy

- https://nexlify.live/
- https://nexlify.live/panel/
- https://nexlify.live/demo
- https://nexlify.live/support

```powershell
ssh root@85.17.162.54 "grep ADMIN /var/www/nexlify/.env"
ssh root@85.17.162.54 "pm2 logs nexlify --lines 30"
```

---

## Troubleshooting

```bash
# On VPS
bash /var/www/nexlify/deploy/fix-nexlify.sh
pm2 restart nexlify
nginx -t && systemctl reload nginx
curl -I http://127.0.0.1:3001
```
