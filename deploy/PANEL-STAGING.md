# Owner staging panel

Use **https://panel.nexlify.live/login** to preview IPTV panel changes before you roll them out to customer installs.

| URL | Purpose |
|-----|---------|
| `https://panel.nexlify.live/login` | **Your staging panel** — apply patches here first |
| `https://panel.demo.nexlify.live/` | Public read-only demo (marketing) |
| `https://nexlify.live/` | Marketing / billing site only |

## Workflow

1. Change panel patches under `deploy/panel-patches/` in this repo.
2. Deploy the repo to the VPS (website + patch files):
   ```powershell
   npm run deploy:update
   ```
3. Apply patches to the staging panel on the VPS:
   ```powershell
   npm run panel:staging
   ```
   Or on the server:
   ```bash
   bash /var/www/nexlify/deploy/panel-staging-update.sh
   ```
4. Test at **https://panel.nexlify.live/login**.
5. When happy, roll out the same patch scripts to production customer panels.

`npm run deploy:update` updates the **website** (`nexlify-web` on :3001). It does **not** automatically change the IPTV panel — use `panel:staging` for that.

## Lock to your IP only (optional)

On the VPS, add your public IP to `/var/www/nexlify/.env`:

```bash
# Find your IP: curl -s ifconfig.me
PANEL_OWNER_IPS=203.0.113.10
# Multiple: PANEL_OWNER_IPS=203.0.113.10,198.51.100.2
PANEL_STAGING_URL=https://panel.nexlify.live/login
```

Then:

```bash
bash /var/www/nexlify/deploy/ensure-panel-staging-access.sh
```

Remove `PANEL_OWNER_IPS` (or leave empty) and re-run the script to open access again.

## Cloudflare alternative

In Cloudflare → Security → WAF, add a rule for hostname `panel.nexlify.live`: allow your IP, block everyone else. Useful if your IP changes often (update the rule instead of SSH).
