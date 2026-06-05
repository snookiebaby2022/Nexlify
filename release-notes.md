## Operator tools, geo flags, and faster panel deployment

### Features
- Country flag icons on Live Connections and Manage Servers (geo lookup via MaxMind or ipapi.co)
- Panel transfer — export and import lines, streams, bouquets, resellers, and providers as JSON
- Provider URL tools — bulk base URL change, cascade to linked streams, find/replace
- One-line Linux installer for fresh Ubuntu/Debian VPS (Node, PostgreSQL, PM2, nginx, SSL)
- Help & FAQ page on nexlify.live with WHMCS and licensing guides
- In-panel updates UI wired to nexlify.live release feed

### Bug fixes
- Demo login hints hidden on panel.nexlify.live — only shown on panel.demo.nexlify.live
- Xtream UI migration no longer duplicates resellers when lines and resellers share a table
- Sidebar categories stay accordion-style (one section open at a time)
- Support menu works reliably on touch devices

### Notes
- Automatic updates require a clean git install on Linux (Admin → Panel update)
- Tarball-only installs must use manual patch scripts or the Linux installer
- Back up PostgreSQL before applying: `pg_dump nexlify > backup.sql`
