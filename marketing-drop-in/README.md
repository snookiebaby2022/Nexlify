# Nexlify marketing website (`marketing-drop-in`)

Public site at **https://nexlify.live** — pricing, trials, licenses, admin, blog.

## VPS deploy (no GitHub on server)

1. On your PC: `git pull origin main`
2. WinSCP upload `marketing-drop-in/scripts/vps-full-update.sh` → `/root/`
3. PuTTY: `bash /root/vps-full-update.sh`

The bundle script extracts source, syncs `.env` from panel, syncs DB plans, builds, and restarts `nexlify-web`.

### Regenerate deploy bundle (after code changes)

```bash
bash marketing-drop-in/scripts/generate-vps-bundle.sh
git add marketing-drop-in/scripts/vps-full-update.sh
git commit -m "Regenerate vps-full-update.sh bundle"
```

### VPS scripts

| Script | Purpose |
|--------|---------|
| `vps-full-update.sh` | Full deploy — upload and run on VPS |
| `setup-marketing-env.sh` | Build `.env` from panel secrets (no PEM in `.env`) |
| `setup-marketing-license-key.sh` | Copy `private.pem` from panel |
| `sync-plans-vps.ts` | Upsert trial + £50 nexlify plan in DB |
| `marketing-health-check.sh` | Post-deploy verification |
| `patch-marketing-on-vps.sh` | Emergency sed patch (no file upload) |

### Marketing `.env`

See `ENV_MARKETING.example.txt`. On VPS run:

```bash
bash /var/www/nexlify/scripts/setup-marketing-env.sh
pm2 restart nexlify-web --update-env
```

---

## TikTok promo — MP4 download

`/promo/tiktok` plays and downloads **`nexlify-tiktok-ad.mp4`**.

### Deploy (generates MP4 on the VPS)

```powershell
.\windows\scripts\deploy-tiktok-promo.ps1
```

This runs `scripts/generate-tiktok-promo-mp4.sh` (requires **ffmpeg** on the server), copies the page into `/var/www/nexlify`, and rebuilds `nexlify-web`.

### URLs

| URL | What |
|-----|------|
| https://nexlify.live/promo/tiktok | Preview + **Download MP4** button |
| https://nexlify.live/promo/nexlify-tiktok-ad.mp4 | Direct file |

### Replace with your own edit

Upload a better MP4 to the VPS (overwrites the generated one):

`/var/www/nexlify/public/promo/nexlify-tiktok-ad.mp4`

No rebuild needed — static file.
