# Nexlify
<<<<<<< HEAD

IPTV / OTT management panel inspired by **XUI.one** and **1-stream**: admin UI, resellers, lines, bouquets, Xtream API, MAG/Stalker portal, EPG, line management, and WHMCS-style billing webhooks.

## Features

| Area | Included |
|------|----------|
| Admin dashboard | Lines, streams, bouquets, resellers, activity |
| Reseller portal | Credits, create/manage lines |
| Line management | Edit, enable, disable, ban, delete, extend expiry |
| Xtream API | `player_api.php`, `get.php`, live URLs, short EPG |
| XUI-style API | `/api/v1?action=create_line` etc. |
| MAG / Stalker | MAC registration, `/c/` portal, `stalker_portal/server/load.php` |
| EPG | XMLTV sources, **60+ country guides**, sync, `get_short_epg` |
| Cache | Redis (optional) + in-memory fallback for stats / Xtream / EPG — see [docs/REDIS.md](docs/REDIS.md) |
| Proxies | HTTP/HTTPS/SOCKS5 under **Servers → Proxies**, assign per server |
| Billing | WHMCS-style webhook: create, suspend, renew, terminate |
| Security | Playback blocklists, fingerprint URLs, geo/country lock, theft detection |
| Migration | XUI SQL, **1-stream PostgreSQL live**, phase-2 servers/categories/EPG |
| Integrations | Plex library import, YouTube channels, access codes, server install wizard |

See [docs/NEXLIFY-ADVANTAGES.md](docs/NEXLIFY-ADVANTAGES.md) for a full comparison vs XUI / 1-stream.

## Licensing (sell the panel)

Signed **Ed25519** license keys, instance binding, optional online activation. See [docs/LICENSE.md](docs/LICENSE.md).

```bash
npm run license:setup    # vendor only — generates signing keys
npm run license:issue -- --email customer@example.com --days 365 --tier pro
```

Customers activate at **Admin → License**. Dev: `NEXLIFY_LICENSE_SKIP=1` in `.env`.

## Requirements

- **Node.js 18.17+** for Next 15 (pinned). **Do not** run `npm i next@latest` on Node 18 — Next 16 requires **Node ≥ 20.9**. Prefer Node 20 LTS (`nvm use` reads `.nvmrc`).

## Quick start

```bash
docker compose up -d
copy .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev
```

### Auto-start in Cursor / VS Code

Opening this folder can start the dev server automatically (`.vscode/tasks.json`). When prompted, allow **“Run Automatic Tasks”**.

Manual start:

- **Linux / macOS:** `chmod +x scripts/start-dev.sh && ./scripts/start-dev.sh`
- **Windows:** `scripts\start-dev.bat` or `scripts\start-dev.ps1` (do **not** run `.bat` on Linux)

If `npm install` fails with `next@9` and React peer errors, confirm `package.json` has `"next": "15.x"` (not `9.x`), delete `node_modules` and `package-lock.json`, then install again.

**Do not run** `npm audit fix --force` — it injects `overrides.next` and causes `EOVERRIDE`. Use:

```bash
chmod +x scripts/install-clean.sh
sed -i 's/\r$//' scripts/install-clean.sh   # if you see bash\r error on Linux/WSL
./scripts/install-clean.sh
```

Or run the same steps without the script:

```bash
node scripts/check-package.mjs
rm -rf node_modules package-lock.json
npm install
```

Or manually:

```bash
# 1. Fix package.json if audit corrupted it (must NOT have overrides.next):
grep -E '"next"|overrides' package.json
# dependencies.next should be "15.5.19" and overrides must be absent

# 2. Clean install
rm -rf node_modules package-lock.json
npm install
```

Open [http://localhost:3000](http://localhost:3000)

### Demo logins

| Role | User | Password |
|------|------|----------|
| Admin | `admin` | `admin123` |
| Reseller | `reseller` | `reseller123` |
| IPTV line | `demo` | `demo123` |
| Demo MAG MAC | `00:1A:79:00:00:01` | linked to `demo` |

## Client URLs

- **Xtream:** `http://localhost:3000/player_api.php?username=demo&password=demo123`
- **M3U:** `http://localhost:3000/get.php?username=demo&password=demo123&type=m3u_plus`
- **EPG:** `…&action=get_short_epg&stream_id={id}`
- **MAG portal:** `http://localhost:3000/c/`
- **Stalker API:** `http://localhost:3000/stalker_portal/server/load.php?type=stb&action=handshake&mac=00:1A:79:00:00:01`

## WHMCS / billing webhook

```http
POST /api/billing/webhook
X-Billing-Secret: your-secret-from-env
Content-Type: application/json

{
  "action": "create",
  "service_id": "12345",
  "username": "customer1",
  "bouquet_ids": ["seed-bouquet-basic"],
  "days": 30,
  "max_connections": 1
}
```

Actions: `create`, `suspend`, `unsuspend`, `terminate`, `renew`

Map WHMCS module hooks:

| WHMCS | Nexlify `action` |
|-------|------------------|
| CreateAccount | `create` |
| SuspendAccount | `suspend` |
| UnsuspendAccount | `unsuspend` |
| TerminateAccount | `terminate` |
| Renew (custom) | `renew` |

Store `service_id` as the line `externalId` for idempotent updates.

**WHMCS module:** Admin → **Billing** → download ZIP, or `npm run package:whmcs`. See [docs/WHMCS.md](docs/WHMCS.md).

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET` | Panel session |
| `BILLING_WEBHOOK_SECRET` | Billing API auth |
| `NEXT_PUBLIC_PANEL_NAME` | Branding (Nexlify) |
| `NEXT_PUBLIC_SERVER_URL` | Public base URL for playlists |
| `ALLOWED_DEV_ORIGINS` | Dev-only: IPs/hosts that may load `/_next/*` (e.g. your VPS IP) |
| `REDIS_URL` | Optional Redis (`redis://localhost:6379`) — see **Servers → Cache / Redis** |
| `PORT` / `PANEL_PORT` | Panel listen port (default `3000`) — **Admin → Settings → Server & port** |
| `PANEL_REPO_PATH` | Git folder for updates (e.g. `C:\Users\lizzi\nexlify-panel` or `/home/nexlify/nexlify-panel`) |

### Panel software update

**Admin → Settings → Panel update** checks the installed version (`package.json`), git status, and can run an automated upgrade on **Linux VPS** (`git pull`, `npm install`, `prisma db push`, `build`). Restart PM2 after a successful run.

On **Windows** or non-git installs, use the manual commands shown on that page from your repo folder:

```bash
cd C:\Users\lizzi\nexlify-panel   # or your VPS path
git pull --ff-only
npm install
npx prisma db push
npx prisma generate
npm run build
pm2 restart nexlify
```

### Nginx (production)

Copy `nginx/nexlify.conf` to your server, set `server_name`, enable SSL, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Point `NEXT_PUBLIC_SERVER_URL` at your public HTTPS URL so playlists and Xtream use the correct host.

### EPG countries

**EPG → All Countries** registers xtream-masters.com XMLTV URLs for every supported region. Use **Import all sources** first; run **Import + sync all** only when you want full programme data (slow).

### VPS / public IP

`npm run dev` binds to `0.0.0.0:3000`. Set in `.env`:

```env
NEXT_PUBLIC_SERVER_URL=http://YOUR_SERVER_IP:3000
ALLOWED_DEV_ORIGINS=YOUR_SERVER_IP,localhost,127.0.0.1
```

## Upload to VPS

**Windows (automatic):** **[windows/DEPLOY-WINDOWS.md](./windows/DEPLOY-WINDOWS.md)** — sync with WinSCP + deploy via PuTTY `plink`:

```powershell
cd windows
Copy-Item deploy.config.example.json deploy.config.json   # edit once
.\scripts\deploy-from-windows.ps1
```

Or double-click **`windows\deploy.bat`**. The `windows/` folder is not uploaded to the VPS.

**Manual / zip:** See **[UPLOAD.md](./UPLOAD.md)**.

```powershell
.\scripts\pack-for-upload.ps1
```

## Production deploy (VPS)

Upload/sync the full `nexlify-panel` folder, then:

```bash
cd /home/nexlify-panel
sed -i 's/\r$//' scripts/*.sh   # if copied from Windows
# Remove legacy cron hooks if they still exist from an old copy
rm -f src/instrumentation.ts src/lib/cron-scheduler.ts
cp .env.example .env   # first time only — edit secrets
npm install
npx prisma db push
npm run build
npm run start
```

Or run `./scripts/deploy-vps.sh` (same steps).

**Cron** (not in-process): `GET /api/cron` with `CRON_SECRET`, or `npm run cron`. Jobs include watch-folder queue, import queue, agent auto-restart, and line expiry. See [docs/STREAM-AGENT.md](docs/STREAM-AGENT.md), [docs/OPS.md](docs/OPS.md).

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Protects `/api/cron` |
| `MEDIA_IMPORT_ROOT` | Folder import / watch folders |

## Legal

Use only for content you have rights to distribute.
=======
Software to stream &amp; manage your own content
>>>>>>> 43d8a8fbb21d88568c0c69f2f33a9f4034b58e8c
