# Features page drop-in

Copy to the marketing site (`/var/www/nexlify`):

- `src/app/features/page.tsx` from this folder
- Add nav link: `{ href: "/features", label: "Features" }`
- Add to sitemap: `{ url: "/features", changeFrequency: "monthly", priority: 0.8 }`

Design matches nexlify.live: dark navy `#0a1628`, cyan accents `#22d3ee`.

Deploy via `windows/scripts/sync-releases-to-website.ps1` (includes features page rsync when configured).
