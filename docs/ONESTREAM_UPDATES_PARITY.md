# 1-Stream updates → Nexlify coverage

Source: public feed `https://billing.1-stream.com/downloads/changelogs.json` (website `/updates/` loads this). Latest at time of write: **v2.2.0**.

Nexlify cannot clone PHP/FPM/Nginx/Laravel stack items (PHP 8.5, Nginx HTTP3, FPM max_children, PG Bouncer, etc.). Those stay 1-stream-only.

## Implemented in this pass (product parity)

| 1-stream update item | Nexlify |
|---|---|
| Metrics export for 3rd-party monitoring | `GET /api/metrics` (Prometheus) — Settings → Monitoring |
| XC API default order | Settings → Streaming → XC API default stream order |
| Search by TMDB ID in listings | Video management + streams API `?search=` |
| Import/Export movies | Export JSON/CSV on Video management (`/api/admin/movies/export`) |
| IP range line lock | Proper IPv4/IPv6 CIDR in `line-ip-lock` |
| Line password restrictions | Security → line password policy |
| Separate video redirect for disabled line | Expiry videos → Disabled / banned lines |
| Watch Folder `is_adult` | Watch folders checkbox → tags imports |
| Exclude disabled from export | Already present |
| MOV/TS formats, DNS rotator, IPDB path, connection history, watched stats, player settings, API token expiry | Already present |

## Still Nexlify-native / configure separately

Autoblock, proxies, rclone/S3 backup, Plex, loyalty/shop-style addons, mass-edit background job processor hardening, Watch Folder failed-files bulk UI, ASN locks, push notifications, 24/7 channel TMDB EPG, Redis line-connection store experiments.

## How to verify after deploy

1. Settings → Monitoring → enable metrics + token → `curl -H "Authorization: Bearer TOKEN" https://PANEL/api/metrics`
2. Settings → Streaming → change XC order → check `player_api.php?action=get_live_streams`
3. Video management → search a TMDB id → Export movies
4. Add line with common password → should reject when policy on
5. Line lock IPs with `10.0.0.0/8`
6. Watch folder → mark adult → scan
