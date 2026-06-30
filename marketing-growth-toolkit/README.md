# Marketing growth toolkit

Drive **visitors and license sales** to [nexlify.live](https://nexlify.live) — deploys into the existing marketing app (`nexlify-web` at `/var/www/nexlify`). No extra subdomain or port.

## What you get

| URL | Who it's for | Purpose |
|-----|----------------|---------|
| **`/grow`** | You (operator) | Overview + quick-copy campaign links |
| **`/grow/links`** | You | Full link kit with copy buttons |
| **`/promo?utm_*`** | Visitors | Text landing → license + demo |
| **`/promo/tiktok?utm_*`** | Visitors | Video promo (already on site if TikTok drop-in deployed) |
| **`/go/license?utm_*`** | Visitors | Short redirect → `/pricing` with UTMs |
| **`/go/demo?utm_*`** | Visitors | Short redirect → panel demo login |

UTM parameters flow through to pricing and demo so Umami / analytics can show what converts.

## Deploy from Windows

```powershell
.\windows\scripts\deploy-marketing-growth-toolkit.ps1
```

## Deploy on VPS (manual)

```bash
bash /home/nexlify-panel/marketing-growth-toolkit/scripts/deploy-to-nexlify-web.sh
```

## Links to use in TikTok bio

```
https://nexlify.live/promo/tiktok?utm_source=tiktok&utm_medium=bio&utm_campaign=operators
```

Text landing (no video):

```
https://nexlify.live/promo?utm_source=tiktok&utm_medium=bio&utm_campaign=operators
```

## Files copied into marketing site

- `src/lib/growth-urls.ts`
- `src/components/growth/*`
- `src/app/grow/**`
- `src/app/go/**`
- CSS snippet appended to `src/app/globals.css`
- `/promo` landing from `promo-for-nexlify-web` if missing

## After deploy

1. Open **https://nexlify.live/grow** — copy links from there.
2. Pin TikTok bio to the promo/tiktok URL above.
3. In Umami, watch events `cta_click` and `link_copy` if tracking is wired on nexlify.live.
