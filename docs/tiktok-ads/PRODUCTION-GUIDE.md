# Nexlify TikTok ads — master production guide

Drive traffic to **https://nexlify.live/promo?utm_source=tiktok** (landing page) or **https://panel.nexlify.live** (live demo).

| Resource | URL / credentials |
|----------|-------------------|
| Marketing site | https://nexlify.live |
| Promo landing | https://nexlify.live/promo?utm_source=tiktok&utm_medium=video&utm_campaign=operators |
| Live demo panel | https://panel.nexlify.live |
| Demo admin login | `admin` / `admin123` |
| Demo reseller login | `reseller` / `reseller123` |

**Tagline:** *Stream management, built for operators*

---

## Overview — all 3 ads

| Ad | File | Length | Style | Primary goal |
|----|------|--------|-------|--------------|
| **A — Still on XUI?** | [`15s-still-on-xui-TIMELINE.md`](./15s-still-on-xui-TIMELINE.md) | 15s | Punch / hook-first, phonk beat | Stop scroll, bio click |
| **B — Problem → fix** | [`30s-problem-fix-TIMELINE.md`](./30s-problem-fix-TIMELINE.md) | 30s | Educational, VO-led | Trust + license intent |
| **C — Demo only** | [`22s-demo-only-TIMELINE.md`](./22s-demo-only-TIMELINE.md) | 22s | Silent-friendly screen record | Product proof, muted FYP |

**Export spec (all ads):** 9:16 · 1080×1920 · 30fps · H.264 · 8–12 Mbps · no letterboxing

**End card asset:** [`public/marketing/tiktok-end-card.png`](../../public/marketing/tiktok-end-card.png) (also in [`assets/tiktok-end-card.png`](./assets/tiktok-end-card.png))

**Drop-in promo page for nexlify-web:** [`../../promo-for-nexlify-web/`](../../promo-for-nexlify-web/)

---

## A/B hook variants (5)

Test **first 2–3 seconds only**; keep the rest of each ad identical. Rotate hooks weekly; track CTR in TikTok Ads Manager.

| # | Hook text (on-screen) | Best for | Use in |
|---|----------------------|----------|--------|
| **1** | **STILL ON XUI IN 2026?** | Broad reach, legacy-panel audience | Ad A (default) |
| **2** | **YOUR PANEL FAILING YOU?** | Pain-aware operators, Sunday-night crowd | Ad B (default) |
| **3** | **IPTV OPS WITHOUT THE 502s** | Technical, anti-freeze angle | Ad A or C swap |
| **4** | **SELF-HOSTED · POSTGRES · MODERN** | Devs / infra-minded | Ad C (default alt) |
| **5** | **MIGRATE FROM XUI IN A WEEKEND** | Migration-intent searchers | Ad B swap or Ad A alt |

**How to test:** Duplicate ad set → same body timeline → replace hook row per variant → UTM `utm_content=hook-N`.

---

## Caption + hashtag pack

### Ad A — 15s punch

```
Still running a legacy IPTV panel? 👀

Nexlify = modern control panel for operators:
✅ Anti-freeze streaming
✅ Reseller tree + credits
✅ WHMCS-ready billing
✅ Self-hosted · PostgreSQL

Try the demo → panel.nexlify.live (admin / admin123)
Get your license → nexlify.live/promo

#iptv #ott #streaming #reseller #whmcs #vps #techtok #saas #iptvpanel
```

### Ad B — 30s educational

```
POV: you finally upgraded your IPTV stack 🎯

Nexlify — self-hosted panel for serious operators.
Not consumer apps. Not piracy. Real infrastructure.

🔗 Demo: panel.nexlify.live
🔗 Licenses: nexlify.live/promo

#iptvpanel #streamingbusiness #ott #resellerpanel #whmcs #postgresql #selfhosted
```

### Ad C — 22s demo (no VO)

```
Watch the full panel — no voice needed 🔇

Modern IPTV ops: lines, agents, anti-freeze, resellers.
Self-hosted on PostgreSQL. Migrate from XUI or 1-stream.

Demo → panel.nexlify.live
License → nexlify.live/promo

#iptv #streaming #saas #demotok #techtok #vps #ott
```

**Comment reply template:** *"Free demo at panel.nexlify.live — login admin / admin123"*

---

## Brand spec

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#080d18` | Page / video base |
| Background gradient | `#060b14` → `#0f172a` | End cards, hero |
| Card | `#121a2e` | UI cards in B-roll |
| Cyan accent | `#22d3ee` | Keywords, links, logo glow |
| Orange CTA | `#f97316` | Buttons, primary CTA pills |
| Orange CTA hover | `#ea580c` | Gradient end stop |
| Text primary | `#eef4fc` | Headlines |
| Text muted | `#94a3b8` / `#8ba3c7` | Subcopy, taglines |
| Danger / pain | `#ef4444` | Error hooks only (Ad B) |

### Typography

- **Headlines / hooks:** Montserrat ExtraBold or Inter Black, 48–72px
- **Feature labels:** Inter Bold, 36–48px; keyword in cyan
- **URL / footer:** Inter Medium, 28–36px
- **Safe zone:** Keep all text above **250px** from bottom (TikTok UI)

### Logo usage

- Use **3D cube logo** from Nexlify login (`Login3dLogo`) — cyan accent default
- Logo accent toggle (cyan ↔ red) allowed in demo clips to show polish
- Wordmark: **NEXLIFY** all caps, letter-spacing +2%
- Minimum clear space: 1× cube height around logo
- Do not stretch, recolor cube to orange, or place on busy backgrounds without vignette

### Motion

- Cuts on beat (~0.9s at 130 BPM for Ad A/C)
- Text: pop-in 0.15s; avoid long typewriter
- Screen records: 100% browser zoom, hide bookmarks bar
- End card hold: **2–3 seconds** minimum

---

## Filming checklist

### Before recording

- [ ] Demo panel reachable at https://panel.nexlify.live
- [ ] Logged out; cache cleared; dark theme + cyan logo accent
- [ ] Browser: Chrome, 1920×1080 display, 100% zoom, bookmarks hidden
- [ ] OBS: 1080×1920 canvas OR record 16:9 and crop in edit
- [ ] Credentials ready: `admin` / `admin123`
- [ ] End card PNG imported to project
- [ ] Music licensed (TikTok commercial library or royalty-free phonk)
- [ ] VO mic if Ad B: quiet room, -12 LUFS target

### Screen record sequence (batch in one session)

1. [ ] Login hero + logo toggle (3s)
2. [ ] Sign in with demo account (5s)
3. [ ] Dashboard wide + stat cards (4s)
4. [ ] Manage lines scroll + row menu (3s)
5. [ ] Add line — package / bouquet (4s)
6. [ ] Live connections or line activity (3s)
7. [ ] Servers / agent tree health (4s)
8. [ ] Stream settings / anti-freeze (3s)
9. [ ] Resellers + credits (4s)
10. [ ] WHMCS / billing settings (3s) — blur secrets
11. [ ] Phone mockup of nexlify.live/promo (3s)

### Post-production

- [ ] Correct timeline per ad (15s / 30s / 22s)
- [ ] Text safe zone verified on device preview
- [ ] Export 1080×1920 30fps H.264
- [ ] Thumbnail = end card or dashboard frame
- [ ] Caption pasted + UTM link in bio
- [ ] Pin comment with demo credentials

### Ad-specific timelines

- Ad A: [`15s-still-on-xui-TIMELINE.md`](./15s-still-on-xui-TIMELINE.md)
- Ad B: [`30s-problem-fix-TIMELINE.md`](./30s-problem-fix-TIMELINE.md)
- Ad C: [`22s-demo-only-TIMELINE.md`](./22s-demo-only-TIMELINE.md)

---

## End card template

**Canvas:** 1080×1920  
**Asset:** Pre-built PNG — [`public/marketing/tiktok-end-card.png`](../../public/marketing/tiktok-end-card.png)

| Element | Spec |
|---------|------|
| Background | Gradient `#060b14` → `#0f172a` |
| Logo | 3D cube ~280px, cyan glow `#22d3ee` |
| Headline | NEXLIFY — white, 72px bold |
| Sub | Stream management, built for operators — `#94a3b8`, 36px |
| CTA pill | **Get your license** — orange `#f97316` gradient |
| Footer | **nexlify.live** + **panel.nexlify.live** — cyan |

Recreate in Canva/Figma if customizing per campaign.

---

## TikTok campaign setup

| Item | Value |
|------|--------|
| Landing URL | `https://nexlify.live/promo?utm_source=tiktok&utm_medium=video&utm_campaign=operators` |
| Bio link | Same URL (Linktree optional: Demo + License + Support) |
| Pixel | Umami / Meta pixel on promo page — track `cta_click` events |
| A/B hooks | 5 variants above; `utm_content=hook-N` |
| Audience | IPTV operators, VPS homelab, streaming business, WHMCS users |

---

## Posting schedule (first 2 weeks)

| Day | Ad | Notes |
|-----|-----|-------|
| Mon | Ad A (15s) | Broad reach |
| Wed | Ad B (30s) | Educate engagers |
| Thu | Ad C (22s) | Muted/demo audience |
| Sat | Ad A hook variant 3 | A/B test |
| Sun | Ad B hook variant 5 | Migration angle |

Reply to every comment within 24h with demo link + credentials.

---

## Product talking points (for VO / captions)

- Modern IPTV panel vs **XUI.one** / **1-stream** / Xtream UI
- **PostgreSQL-native** — live migration from 1-stream, SQL import from XUI
- **Anti-freeze** + fast zapping on edge agents
- **Reseller tree**, credits, packages, access codes
- **WHMCS** webhooks + downloadable module
- **Self-hosted** — Docker, PM2, your data stays yours
- Stream **agent v2**, nginx snippet push, process monitor
