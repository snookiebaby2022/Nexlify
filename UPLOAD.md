# Upload Nexlify to VPS

## Windows — automatic (WinSCP + PuTTY)

See **[windows/DEPLOY-WINDOWS.md](./windows/DEPLOY-WINDOWS.md)**. After one-time config:

```powershell
cd windows
.\scripts\deploy-from-windows.ps1
```

Or double-click **`windows\deploy.bat`**.

---

## Manual upload

Copy the **entire** `nexlify-panel` folder to the server (e.g. `/home/nexlify-panel`).

## Do not upload

- `node_modules/`
- `.next/`
- `.env` (create on server from `.env.example`)

## On the server

```bash
cd /home/nexlify-panel
# Fix Windows line endings if scripts fail with bash\r
sed -i 's/\r$//' scripts/*.sh
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

Or step by step:

```bash
rm -f src/instrumentation.ts src/lib/cron-scheduler.ts
npm install
npx prisma db push
npm run build
npm run start
```

## After upload — quick checks

| Check | Command |
|-------|---------|
| No legacy cron | `test ! -f src/instrumentation.ts && echo OK` |
| Schema current | `grep sortOrder prisma/schema.prisma \| head -1` |
| Build | `npm run build` |

## Cron (production)

```bash
* * * * * curl -fsS -H "x-cron-secret: YOUR_SECRET" "http://127.0.0.1:3000/api/cron"
```

Set `CRON_SECRET` in `.env`.

## PM2 on Linux

The app name is **`nexlify`**. You must **start** it once before `pm2 restart nexlify` works.

If you see `Process or Namespace nexlify not found`, the app was never started — run `./scripts/pm2-start.sh`, not `pm2 restart nexlify`.

```bash
cd /home/nexlify-panel
sed -i 's/\r$//' scripts/*.sh
chmod +x scripts/pm2-start.sh
npm run build
./scripts/pm2-start.sh
```

### Install PM2 (if `pm2: command not found`)

```bash
sudo npm install -g pm2
# or without sudo if npm global prefix is in your home:
npm install -g pm2
```

Ensure global npm bin is on PATH (add to `~/.bashrc` if needed):

```bash
export PATH="$PATH:$(npm config get prefix)/bin"
```

### Common fixes

| Problem | Fix |
|--------|-----|
| `pm2: command not found` | `sudo npm install -g pm2`, fix PATH above |
| `nexlify` not found / restart fails | Run `./scripts/pm2-start.sh` (first start), not only `restart` |
| `node: command not found` under PM2 | Use full path: `which node`, then in `ecosystem.config.cjs` set `interpreter: "/path/to/node"` |
| nvm / fnm | Start PM2 from a login shell after `nvm use 18`, or set `interpreter` to absolute node path |
| App exits immediately | `pm2 logs nexlify` — usually missing `.env`, failed build, or port 3000 in use |
| Permission denied on port 80 | Keep port **3000** and put nginx/caddy in front |
| PM2 not after reboot | `./scripts/pm2-boot-enable.sh` (or `npm run pm2:boot`) → run printed `sudo` command → `./scripts/pm2-start.sh` |
| `bash\r` / scripts won't run | `sed -i 's/\r$//' scripts/*.sh` then retry |
| Panel slow / won't load | Sync latest code, then `./scripts/vps-restart-panel.sh`. Set `PANEL_FORCE_HTTPS=0` if nginx lacks `X-Forwarded-Proto`. Use `http://IP:3000` or fix domain in `.env`. |
| Cron not running | `pm2 status` should show **nexlify-cron**. Started automatically by `./scripts/pm2-start.sh`. |

Useful commands:

```bash
pm2 status
pm2 logs nexlify --lines 50
pm2 restart nexlify
pm2 delete nexlify    # remove process; then ./scripts/pm2-start.sh again
```

### Without PM2 (systemd)

Create `/etc/systemd/system/nexlify.service` (adjust paths/user):

```ini
[Unit]
Description=Nexlify IPTV Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/nexlify-panel
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexlify
sudo systemctl status nexlify
journalctl -u nexlify -f
```

Use `which node` and `which npm` if they are not in `/usr/bin`.

## Version

Panel package **0.1.1** — build fixes, Prisma models (tickets, packages, groups, providers), no bouquet credits, no in-process cron.
