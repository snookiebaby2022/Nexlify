# Website + IPTV panel on one public port (443)

Your **panel uses port 3000** (PM2 name `nexlify` in `/home/nexlify-panel`).  
The **website** runs on **3001** (PM2 name `nexlify-web` in `/var/www/nexlify`) — do not use PM2 name `nexlify` for the website or deploy will kill the panel.

After every deploy, `ensure-site.sh` fixes **both** apps + nginx.

| Service | Port (internal) | Public URL |
|---------|-----------------|------------|
| IPTV panel | **3000** | `https://nexlify.live/panel/` |
| Nexlify website | **3001** | `https://nexlify.live/` |

Only **nginx** listens on 80/443.

## VPS setup

```bash
# Panel stays on 3000 — do not change
# Nexlify must use 3001 (PM2 env PORT=3001)

grep PORT /var/www/nexlify/.env
# Should show PORT=3001

pm2 restart nexlify

cp /var/www/nexlify/deploy/nginx-nexlify.conf /etc/nginx/sites-available/nexlify.live
# If certbot added SSL, copy the location blocks into the :443 server {} too

nginx -t && systemctl reload nginx
```

## Verify

```bash
ss -tlnp | grep -E ':3000|:3001'
curl -sI http://127.0.0.1:3000 | head -1   # panel
curl -sI http://127.0.0.1:3001 | head -1   # website
curl -sI https://nexlify.live/ | head -1
curl -sI https://nexlify.live/panel/ | head -1
```

## Env

```env
PORT=3001
NEXT_PUBLIC_APP_URL=https://nexlify.live
NEXT_PUBLIC_DEMO_PANEL_URL=https://nexlify.live/panel
```

## Panel at `/` only?

If the panel cannot run under `/panel/`, keep it on 3000 at `https://panel.nexlify.live` (separate nginx `server_name`, same VPS IP).
