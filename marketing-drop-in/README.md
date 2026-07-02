# TikTok promo — MP4 download

`/promo/tiktok` plays and downloads **`nexlify-tiktok-ad.mp4`**.

## Deploy (generates MP4 on the VPS)

```powershell
.\windows\scripts\deploy-tiktok-promo.ps1
```

This runs `scripts/generate-tiktok-promo-mp4.sh` (requires **ffmpeg** on the server), copies the page into `/var/www/nexlify`, and rebuilds `nexlify-web`.

## URLs

| URL | What |
|-----|------|
| https://nexlify.live/promo/tiktok | Preview + **Download MP4** button |
| https://nexlify.live/promo/nexlify-tiktok-ad.mp4 | Direct file |

## Replace with your own edit

Upload a better MP4 to the VPS (overwrites the generated one):

`/var/www/nexlify/public/promo/nexlify-tiktok-ad.mp4`

No rebuild needed — static file.
