# Nexlify promo landing — drop-in for marketing site

TikTok-optimized landing page. Copy into the **marketing** Next.js app on the VPS.

## Where the marketing site actually lives

There is **no** `/home/nexlify-web` on the VPS. The live marketing app is:

| | |
|--|--|
| **WinSCP / SSH path** | `/var/www/nexlify` |
| **PM2 process** | `nexlify-web` (port **3001**) |
| **App Router root** | `src/app/` (not `app/` at repo root) |
| **Components** | `src/components/` |

A TikTok auto-play promo **already exists** at **`/promo/tiktok`** (`src/app/promo/tiktok/page.tsx`).  
Bio link (works today): `https://nexlify.live/promo/tiktok?utm_source=tiktok&utm_medium=video&utm_campaign=operators`

Use the files below only if you want a separate static landing at **`/promo`** (no auto-play slideshow).

## Files to copy

| Source (this folder) | Destination (`/var/www/nexlify`) |
|----------------------|----------------------------------|
| `app/promo/page.tsx` | `src/app/promo/page.tsx` |
| `components/promo-landing.tsx` | `src/components/promo-landing.tsx` |
| `promo-globals-snippet.css` | Merge into `src/app/globals.css` (optional) |

## Install steps

1. **Copy files** into the nexlify-web repo at the paths above.

2. **Optional — brand CSS vars**  
   Append the contents of `promo-globals-snippet.css` to `app/globals.css` if nexlify-web does not already define `--promo-*` tokens.

3. **Tailwind**  
   If nexlify-web uses Tailwind (recommended), the page works as-is. If not, the component uses inline `style` fallbacks on key elements — no extra deps required.

4. **Verify routes**  
   ```bash
   npm run dev
   # Open http://localhost:3000/promo?utm_source=tiktok&utm_medium=video&utm_campaign=operators
   ```

5. **Production URLs**
   - License CTA → `https://nexlify.live` (or your checkout path)
   - Demo CTA → `https://panel.nexlify.live` (credentials: `admin` / `admin123`)

6. **Analytics**  
   Wire `onCtaClick` in `promo-landing.tsx` to Umami / Meta pixel:
   ```ts
   // Example: umami.track('cta_click', { placement: 'hero-license', ...utm })
   ```

7. **Deploy**  
   Deploy nexlify-web as usual. TikTok bio link:
   ```
   https://nexlify.live/promo?utm_source=tiktok&utm_medium=video&utm_campaign=operators
   ```

## UTM parameters

The page reads these from `searchParams` and appends them to outbound CTAs:

| Param | Example |
|-------|---------|
| `utm_source` | `tiktok` |
| `utm_medium` | `video` |
| `utm_campaign` | `operators` |
| `utm_content` | `hook-1` |

## TikTok ad bundle

Full timelines and production guide live in the **nexlify-panel** repo:

- `docs/tiktok-ads/PRODUCTION-GUIDE.md`
- `docs/tiktok-ads/*-TIMELINE.md`
- `public/marketing/tiktok-end-card.png`
