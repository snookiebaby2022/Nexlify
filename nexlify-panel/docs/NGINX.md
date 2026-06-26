# Nginx for Nexlify

Two roles: **panel** (Next.js) and **stream edges** (live/VOD).

## Panel VPS

Use `nginx/nexlify.conf`:

- Terminate TLS (Let’s Encrypt via **Domains & SSL**)
- Proxy to `127.0.0.1:3000` (or **Server & port**)
- Long timeouts on `/live/`, `player_api.php`, `get.php`
- `client_max_body_size` for uploads

```bash
sudo cp nginx/nexlify.conf /etc/nginx/sites-available/nexlify
sudo nginx -t && sudo systemctl reload nginx
```

Set `NEXT_PUBLIC_SERVER_URL=https://your-domain` in `.env`.

### nexlify.live on port 3000 (HTTPS)

The marketing site may run on **443**; the IPTV panel uses **https://nexlify.live:3000**.

1. Next.js listens on **127.0.0.1:3000** only (`PANEL_BEHIND_NGINX=1` in `.env`).
2. Install the TLS proxy:

```bash
# If edited on Windows, fix CRLF first (or run on dev machine: npm run fix:sh)
sed -i 's/\r$//' scripts/install-nginx-panel-3000.sh
chmod +x scripts/install-nginx-panel-3000.sh
bash scripts/install-nginx-panel-3000.sh
```

Config file (either path works):

- `nginx/nexlify.live-3000.conf`
- `scripts/nginx-nexlify-live-3000.conf`

The install script also embeds the same template if both are missing on the server.

3. `.env` should include:

```
PORT=3000
PANEL_BEHIND_NGINX=1
PANEL_PRIMARY_DOMAIN=nexlify.live
NEXT_PUBLIC_SERVER_URL=https://nexlify.live:3000
NEXT_PUBLIC_WEBSITE_URL=https://nexlify.live:3000
PANEL_ASSUME_PROXY_SSL=1
```

4. `pm2 restart nexlify --update-env` and open **http://nexlify.live:3000/login**.

**400 Bad Request — “plain HTTP request was sent to HTTPS port”:** nginx was using `listen 3000 ssl` while TLS did not complete. Re-run the installer (HTTP is default):

```bash
bash scripts/install-nginx-panel-3000.sh
```

Only enable TLS on :3000 if you really need `https://` on that port:

```bash
PANEL_3000_SSL=1 bash scripts/install-nginx-panel-3000.sh
```

Ensure nothing else binds `0.0.0.0:3000` except nginx (`ss -tlnp | grep 3000`). Next.js must use `PANEL_BEHIND_NGINX=1` (bind `127.0.0.1:3000` only).

## Stream servers (edges)

1. Install the **stream agent** (`scripts/nexlify-stream-agent.sh`).
2. Agent writes **`/etc/nexlify-agent/nginx-snippet.conf`** from panel **Settings → Streaming**.
3. Include in your main `http {}` or server block:

```nginx
include /etc/nexlify-agent/nginx-snippet.conf;
```

### Live (low latency)

- `proxy_buffering off` for live locations (snippet uses panel “Nginx buffer Live” setting)
- Match `proxy_read_timeout` to panel **Read timeout**

### VOD

- May enable buffering using panel **Nginx buffer (VOD)** counts/sizes

### HLS

- Set `hls_fragment` to panel **HLS segment duration** (default 6s) in your app/rtmp config

## Health check

```bash
curl -s https://panel.example.com/api/health
```

## Related docs

- [STREAM-AGENT.md](./STREAM-AGENT.md)
- [REDIS.md](./REDIS.md)
