# TikTok — demo panel walkthrough

**Goal:** Show prospects what the Nexlify demo panel feels like in under 60 seconds.

## URLs

| Asset | URL |
|-------|-----|
| Animated recorder (best quality) | https://nexlify.live/promo/tiktok-demo |
| Downloadable MP4 | https://nexlify.live/promo/nexlify-tiktok-demo.mp4 |
| Live demo panel | https://panel.demo.nexlify.live |

Demo login: use **Admin** / **Reseller** buttons on the sign-in card (or `admin` / `admin123`).

## Option A — Screen record the animated page (recommended)

1. Open https://nexlify.live/promo/tiktok-demo on your phone or in a 9:16 browser window (430×760).
2. Start screen recording **before** the loop restarts (~52s full loop).
3. Add voiceover in CapCut:
   - *"This is the actual Nexlify panel — demo mode, no signup."*
   - *"One tap Admin or Reseller… dashboard, lines, live connections."*
   - *"Full reseller tree with credits and sub-users."*
   - *"Try panel.demo.nexlify.live — link in bio."*
4. Export 1080×1920 · 30fps.

## Option B — Download MP4 (with voiceover)

Deploy with `windows\scripts\deploy-tiktok-demo.ps1`, then download:

https://nexlify.live/promo/nexlify-tiktok-demo.mp4

The MP4 includes four voiceover lines (espeak-ng or edge-tts on the VPS):

1. *Real Nexlify panel — demo mode, no signup.*
2. *One tap Admin… dashboard, lines, who is watching live.*
3. *Reseller view: credits, sub-users, packages.*
4. *Try panel.demo.nexlify.live — link in bio.*

Add background music in CapCut at −12 dB under the VO if you want.

## Option C — Real panel screen capture

Record **panel.demo.nexlify.live** (or panel.nexlify.live with demo logins):

1. Login → tap **Admin** demo (3s)
2. Dashboard stats + map (5s)
3. Lines list → scroll (4s)
4. Live connections (4s)
5. Switch to **Reseller** demo → credits (4s)
6. End card: nexlify.live (3s)

Cut to the animated CTA from Option A for a hybrid ad.

## Caption template

```
POV: testing a modern IPTV panel in 60 seconds 👀

Nexlify demo — real admin + reseller UI
✅ Dashboard & live connections
✅ Lines, MAG, packages
✅ Reseller credits & sub-users

Try free → panel.demo.nexlify.live
License → nexlify.live

#iptv #ott #reseller #techtok #saas #selfhosted #streaming #vps
```

## Deploy from Windows

```powershell
cd C:\Users\lizzi\nexlify-panel\windows
.\scripts\deploy-tiktok-demo.ps1
```
