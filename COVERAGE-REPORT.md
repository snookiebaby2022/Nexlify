# Coverage report

Generated: 2026-09-10T15:26:02.984Z

Scope: `src/lib/**`, `src/app/api/**`, `player_api.php`, `get.php` under c8 `--all` after pretest + unit + smoke + streaming + integration + data-layer.

## Overall coverage

| Metric | Covered | Total | % |
|--------|--------:|------:|--:|
| Lines | 13478 | 104196 | 12.93% |
| Statements | 13478 | 104196 | 12.93% |
| Functions | 1847 | 4270 | 43.25% |
| Branches | 3642 | 5697 | 63.92% |

## Per-module coverage (lowest first)

| Module | Lines % | Covered/Total | Files |
|--------|--------:|--------------:|------:|
| lib/media-integrations.ts | 0% | 0/1564 | 1 |
| lib/mag-portal-html.ts | 0% | 0/1500 | 1 |
| lib/cron-jobs.ts | 0% | 0/1392 | 1 |
| api/admin/streams | 0% | 0/2777 | 18 |
| lib/dashboard-widgets.ts | 0% | 0/1009 | 1 |
| lib/panel-update.ts | 0% | 0/862 | 1 |
| lib/xtream.ts | 0% | 0/647 | 1 |
| lib/xui-api-extended.ts | 0% | 0/582 | 1 |
| lib/license | 0% | 0/1289 | 10 |
| lib/avatar-catalog.ts | 0% | 0/529 | 1 |
| api/admin/integrations | 0% | 0/511 | 1 |
| lib/dashboard-server-metrics.ts | 0% | 0/478 | 1 |
| lib/use-hls-player.ts | 0% | 0/476 | 1 |
| api/admin/resellers | 0% | 0/647 | 4 |
| api/internal/live-auth | 0% | 0/447 | 1 |
| lib/xui-api.ts | 0% | 0/447 | 1 |
| lib/panel-transfer-import.ts | 0% | 0/441 | 1 |
| api/admin/lines | 0% | 0/1359 | 9 |
| lib/panel-notifications.ts | 0% | 0/435 | 1 |
| api/admin/migrate | 0% | 0/460 | 2 |
| lib/repair-imported-panel.ts | 0% | 0/406 | 1 |
| lib/free-radio-stations.ts | 0% | 0/390 | 1 |
| lib/panel-monitoring-jobs.ts | 0% | 0/390 | 1 |
| api/admin/stream-providers | 0% | 0/474 | 3 |
| lib/repair-bouquet-category-split.ts | 0% | 0/381 | 1 |
| api/admin/watch-folders | 0% | 0/378 | 1 |
| lib/artwork-fill.ts | 0% | 0/378 | 1 |
| lib/xtream-catalog-blob.ts | 0% | 0/370 | 1 |
| src/app/player_api.php | 0% | 0/363 | 1 |
| lib/pg-dump.ts | 0% | 0/351 | 1 |
| api/admin/bouquets | 0% | 0/381 | 2 |
| api/admin/categories | 0% | 0/804 | 8 |
| lib/category-auto-sort.ts | 0% | 0/333 | 1 |
| api/admin/servers | 0% | 0/1754 | 17 |
| lib/music-import.ts | 0% | 0/323 | 1 |
| lib/stream-agent-config.ts | 0% | 0/320 | 1 |
| api/admin/backup | 0% | 0/317 | 1 |
| lib/server-remote-install.ts | 0% | 0/309 | 1 |
| api/reseller/users | 0% | 0/493 | 3 |
| api/admin/episodes | 0% | 0/302 | 1 |
| lib/i18n | 0% | 0/301 | 1 |
| lib/host-metrics.ts | 0% | 0/300 | 1 |
| api/admin/series | 0% | 0/295 | 1 |
| lib/server-optimization.ts | 0% | 0/295 | 1 |
| lib/emby-jellyfin-import.ts | 0% | 0/286 | 1 |
| lib/dashboard-stats.ts | 0% | 0/279 | 1 |
| lib/streaming-health.ts | 0% | 0/275 | 1 |
| api/auth/login | 0% | 0/271 | 1 |
| api/admin/m3u-sync | 0% | 0/266 | 1 |
| lib/backup-restore.ts | 0% | 0/265 | 1 |
| _…and 661 more modules_ | | | |

## Files under 50% coverage

Count: **758** (of 852 instrumented). Zero-line files: **657**.

| File | Lines % | Covered/Total |
|------|--------:|--------------:|
| `src/lib/media-integrations.ts` | 0% | 0/1564 |
| `src/lib/mag-portal-html.ts` | 0% | 0/1500 |
| `src/lib/cron-jobs.ts` | 0% | 0/1392 |
| `src/lib/connections.ts` | 20.05% | 229/1142 |
| `src/app/api/admin/streams/route.ts` | 0% | 0/1051 |
| `src/lib/dashboard-widgets.ts` | 0% | 0/1009 |
| `src/lib/import-media.ts` | 13.03% | 118/905 |
| `src/lib/panel-update-job.ts` | 22.17% | 196/884 |
| `src/lib/panel-update.ts` | 0% | 0/862 |
| `src/lib/lines.ts` | 30.41% | 215/707 |
| `src/lib/xtream.ts` | 0% | 0/647 |
| `src/lib/stream-provider-probe.ts` | 13.16% | 84/638 |
| `src/lib/provider-xtream-sync.ts` | 13.87% | 87/627 |
| `src/lib/stream-duplicates.ts` | 15.78% | 99/627 |
| `src/lib/xui-api-extended.ts` | 0% | 0/582 |
| `src/lib/license/state.ts` | 0% | 0/560 |
| `src/lib/stalker.ts` | 11.06% | 59/533 |
| `src/lib/avatar-catalog.ts` | 0% | 0/529 |
| `src/lib/backup-run.ts` | 14.94% | 78/522 |
| `src/lib/ts-hls-packager.ts` | 21.51% | 111/516 |
| `src/app/api/admin/integrations/route.ts` | 0% | 0/511 |
| `src/lib/import-live-m3u.ts` | 8.99% | 44/489 |
| `src/lib/dashboard-server-metrics.ts` | 0% | 0/478 |
| `src/lib/use-hls-player.ts` | 0% | 0/476 |
| `src/app/api/admin/resellers/route.ts` | 0% | 0/459 |
| `src/lib/stalker-portal-ext.ts` | 12.63% | 58/459 |
| `src/lib/server-load.ts` | 16.66% | 76/456 |
| `src/lib/live-upstream-proxy.ts` | 38.49% | 174/452 |
| `src/app/api/internal/live-auth/route.ts` | 0% | 0/447 |
| `src/lib/xui-api.ts` | 0% | 0/447 |
| `src/lib/panel-transfer-import.ts` | 0% | 0/441 |
| `src/app/api/admin/lines/[id]/route.ts` | 0% | 0/435 |
| `src/lib/panel-notifications.ts` | 0% | 0/435 |
| `src/app/api/admin/migrate/route.ts` | 0% | 0/418 |
| `src/lib/repair-imported-panel.ts` | 0% | 0/406 |
| `src/lib/live-fleet-heal.ts` | 22.41% | 89/397 |
| `src/lib/free-radio-stations.ts` | 0% | 0/390 |
| `src/lib/panel-monitoring-jobs.ts` | 0% | 0/390 |
| `src/app/api/admin/stream-providers/route.ts` | 0% | 0/388 |
| `src/lib/repair-bouquet-category-split.ts` | 0% | 0/381 |
| `src/app/api/admin/watch-folders/route.ts` | 0% | 0/378 |
| `src/lib/artwork-fill.ts` | 0% | 0/378 |
| `src/lib/xtream-catalog-blob.ts` | 0% | 0/370 |
| `src/app/player_api.php/route.ts` | 0% | 0/363 |
| `src/app/api/admin/lines/route.ts` | 0% | 0/355 |
| `src/lib/pg-dump.ts` | 0% | 0/351 |
| `src/app/api/admin/bouquets/route.ts` | 0% | 0/342 |
| `src/app/api/admin/categories/route.ts` | 0% | 0/335 |
| `src/lib/category-auto-sort.ts` | 0% | 0/333 |
| `src/app/api/admin/servers/[id]/agent/route.ts` | 0% | 0/330 |
| `src/app/api/admin/streams/mass/route.ts` | 0% | 0/325 |
| `src/lib/music-import.ts` | 0% | 0/323 |
| `src/lib/line-playback.ts` | 12.11% | 39/322 |
| `src/lib/stream-agent-config.ts` | 0% | 0/320 |
| `src/app/api/admin/backup/route.ts` | 0% | 0/317 |
| `src/lib/cache.ts` | 18.67% | 59/316 |
| `src/lib/server-remote-install.ts` | 0% | 0/309 |
| `src/app/api/reseller/users/route.ts` | 0% | 0/308 |
| `src/app/api/admin/episodes/route.ts` | 0% | 0/302 |
| `src/lib/i18n/panel-i18n.ts` | 0% | 0/301 |
| `src/lib/host-metrics.ts` | 0% | 0/300 |
| `src/app/api/admin/series/route.ts` | 0% | 0/295 |
| `src/lib/server-optimization.ts` | 0% | 0/295 |
| `src/lib/license/remote-sync.ts` | 0% | 0/293 |
| `src/lib/epg.ts` | 37.88% | 111/293 |
| `src/lib/integration-bouquet.ts` | 14.13% | 41/290 |
| `src/app/api/admin/lines/mass/route.ts` | 0% | 0/289 |
| `src/app/api/admin/servers/route.ts` | 0% | 0/288 |
| `src/lib/vod-category.ts` | 11.8% | 34/288 |
| `src/lib/emby-jellyfin-import.ts` | 0% | 0/286 |
| `src/lib/dvr-service.ts` | 15.03% | 43/286 |
| `src/lib/xtream-stream-id.ts` | 21.42% | 60/280 |
| `src/lib/dashboard-stats.ts` | 0% | 0/279 |
| `src/lib/streaming-health.ts` | 0% | 0/275 |
| `src/app/api/auth/login/route.ts` | 0% | 0/271 |
| `src/app/api/admin/m3u-sync/route.ts` | 0% | 0/266 |
| `src/lib/cache-invalidate.ts` | 16.16% | 43/266 |
| `src/lib/backup-restore.ts` | 0% | 0/265 |
| `src/lib/builtin-addons-catalog.ts` | 0% | 0/263 |
| `src/lib/epg-fetch.ts` | 0% | 0/262 |
| `src/lib/recategorize-from-provider.ts` | 20.84% | 54/259 |
| `src/app/api/admin/backup-restore/route.ts` | 0% | 0/257 |
| `src/lib/panel-api-caller.ts` | 0% | 0/257 |
| `src/lib/playback-guard.ts` | 29.18% | 75/257 |
| `src/lib/panel-server.ts` | 41.24% | 106/257 |
| `src/lib/xmltv-export.ts` | 0% | 0/253 |
| `src/lib/vod-tmdb-backfill.ts` | 0% | 0/248 |
| `src/app/api/admin/remote-categories/route.ts` | 0% | 0/246 |
| `src/lib/catchup-tv.ts` | 0% | 0/242 |
| `src/lib/epg-auto-match.ts` | 28.33% | 68/240 |
| `src/app/api/billing/coupon/route.ts` | 0% | 0/237 |
| `src/lib/panel-notification-events.ts` | 0% | 0/237 |
| `src/lib/integration-sync-progress.ts` | 32.48% | 77/237 |
| `src/lib/stream-create-data.ts` | 0% | 0/235 |
| `src/lib/music-relay.ts` | 15.74% | 37/235 |
| `src/lib/provider-remote-catalog.ts` | 34.46% | 81/235 |
| `src/lib/smart-cdn.ts` | 35.77% | 83/232 |
| `src/lib/auth.ts` | 0% | 0/230 |
| `src/lib/stalker-portal-handle.ts` | 0% | 0/230 |
| `src/lib/panel-transfer-export.ts` | 0% | 0/229 |
| `src/lib/live-starved-failover.ts` | 24.22% | 55/227 |
| `src/lib/ensure-main-server-online.ts` | 24.88% | 56/225 |
| `src/lib/live-reconnect-orphans.ts` | 0% | 0/224 |
| `src/lib/app-builder-apk.ts` | 0% | 0/221 |
| `src/lib/stream-agent.ts` | 0% | 0/221 |
| `src/app/api/admin/device-binding/route.ts` | 0% | 0/217 |
| `src/lib/m3u-sync-jobs.ts` | 0% | 0/217 |
| `src/app/api/admin/disaster-recovery/route.ts` | 0% | 0/215 |
| `src/lib/artwork-fill-progress.ts` | 0% | 0/215 |
| `src/lib/panel-migrate-job.ts` | 0% | 0/215 |
| `src/lib/reassign-uncategorized-live.ts` | 0% | 0/211 |
| `src/lib/panel-version.ts` | 0% | 0/207 |
| `src/app/api/admin/panel-update/route.ts` | 0% | 0/204 |
| `src/lib/panel-releases-feed.ts` | 33% | 67/203 |
| `src/lib/xui-admin-modules.ts` | 0% | 0/202 |
| `src/lib/domains.ts` | 21.28% | 43/202 |
| `src/lib/license/server-guard.ts` | 0% | 0/201 |
| `src/lib/backup-archive.ts` | 13.93% | 28/201 |
| `src/lib/manage-lines-list.ts` | 0% | 0/200 |
| `src/lib/plex-sync-queue.ts` | 0% | 0/199 |
| `src/app/api/admin/mag/route.ts` | 0% | 0/197 |
| `src/lib/panel-chat-notify.ts` | 0% | 0/196 |
| `src/lib/vod-proxy.ts` | 27.55% | 54/196 |
| `src/app/api/admin/enigma/route.ts` | 0% | 0/195 |
| `src/lib/xtream-info.ts` | 23.71% | 46/194 |
| `src/lib/cloud-backup.ts` | 0% | 0/191 |
| `src/app/api/admin/app-builder/route.ts` | 0% | 0/190 |
| `src/app/api/admin/cdn-switch/route.ts` | 0% | 0/190 |
| `src/lib/theft-detection-jobs.ts` | 0% | 0/189 |
| `src/lib/panel-health-watchdog.ts` | 0% | 0/186 |
| `src/lib/playback-quality-monitor.ts` | 0% | 0/185 |
| `src/lib/retention-analytics.ts` | 0% | 0/183 |
| `src/lib/live-sports-types.ts` | 0% | 0/181 |
| `src/lib/panel-port-sync.ts` | 0% | 0/181 |
| `src/lib/session-management.ts` | 0% | 0/181 |
| `src/app/api/admin/ai/viewer-analytics/route.ts` | 0% | 0/179 |
| `src/app/api/admin/same-ip-detection/route.ts` | 0% | 0/179 |
| `src/lib/stream-live-stats.ts` | 0% | 0/176 |
| `src/app/api/admin/ai/natural-language/route.ts` | 0% | 0/174 |
| `src/app/api/admin/auto-scale/route.ts` | 0% | 0/173 |
| `src/app/api/admin/lb-sessions/route.ts` | 0% | 0/172 |
| `src/lib/cert-monitor.ts` | 0% | 0/171 |
| `src/lib/stream-testing.ts` | 0% | 0/171 |
| `src/lib/billing.ts` | 0% | 0/168 |
| `src/lib/source-failover.ts` | 20.83% | 35/168 |
| `src/lib/gpu-transcode.ts` | 0% | 0/167 |
| `src/lib/hls-mpegts-relay.ts` | 0% | 0/166 |
| `src/app/api/admin/tickets/route.ts` | 0% | 0/164 |
| `src/lib/hls-restream-daemon.ts` | 0% | 0/164 |
| `src/app/api/admin/packages/route.ts` | 0% | 0/163 |
| _…and 608 more_ | | |

## Endpoints with no test coverage (0% lines)

Count: **344** route handlers at 0% line coverage under this suite.

| Endpoint route file |
|--------------------|
| `src/app/api/admin/access-codes/route.ts` |
| `src/app/api/admin/activity-logs/route.ts` |
| `src/app/api/admin/addon-licenses/route.ts` |
| `src/app/api/admin/advanced-analytics/route.ts` |
| `src/app/api/admin/advanced-epg/route.ts` |
| `src/app/api/admin/affiliates/route.ts` |
| `src/app/api/admin/ai/anomaly-detector/route.ts` |
| `src/app/api/admin/ai/bouquet-builder/route.ts` |
| `src/app/api/admin/ai/epg-scraper/apply/route.ts` |
| `src/app/api/admin/ai/epg-scraper/route.ts` |
| `src/app/api/admin/ai/health-predictor/route.ts` |
| `src/app/api/admin/ai/invoice-generator/route.ts` |
| `src/app/api/admin/ai/logo-generator/route.ts` |
| `src/app/api/admin/ai/natural-language/route.ts` |
| `src/app/api/admin/ai/restream-detector/route.ts` |
| `src/app/api/admin/ai/seasonal-recommender/route.ts` |
| `src/app/api/admin/ai/support-chat/route.ts` |
| `src/app/api/admin/ai/thumbnail-generator/route.ts` |
| `src/app/api/admin/ai/transcode-recommender/route.ts` |
| `src/app/api/admin/ai/viewer-analytics/route.ts` |
| `src/app/api/admin/ai/voice-query/route.ts` |
| `src/app/api/admin/analytics/bandwidth/route.ts` |
| `src/app/api/admin/analytics/insights/route.ts` |
| `src/app/api/admin/analytics/pdf/route.ts` |
| `src/app/api/admin/analytics/route.ts` |
| `src/app/api/admin/app-builder/route.ts` |
| `src/app/api/admin/apps-lock/check/route.ts` |
| `src/app/api/admin/apps-lock/route.ts` |
| `src/app/api/admin/auto-scale/route.ts` |
| `src/app/api/admin/backup-restore/route.ts` |
| `src/app/api/admin/backup/route.ts` |
| `src/app/api/admin/bandwidth-predict/route.ts` |
| `src/app/api/admin/billing-integration/route.ts` |
| `src/app/api/admin/billing/route.ts` |
| `src/app/api/admin/binaries/discover/route.ts` |
| `src/app/api/admin/binaries/install/route.ts` |
| `src/app/api/admin/binaries/status/route.ts` |
| `src/app/api/admin/blocklists/route.ts` |
| `src/app/api/admin/bouquets/repair-categories/route.ts` |
| `src/app/api/admin/bouquets/route.ts` |
| `src/app/api/admin/cache/route.ts` |
| `src/app/api/admin/catchup/route.ts` |
| `src/app/api/admin/categories/auto-sort/route.ts` |
| `src/app/api/admin/categories/ensure-panel/route.ts` |
| `src/app/api/admin/categories/mass/route.ts` |
| `src/app/api/admin/categories/match-provider-m3u/route.ts` |
| `src/app/api/admin/categories/normalize-names/route.ts` |
| `src/app/api/admin/categories/remove-duplicates/route.ts` |
| `src/app/api/admin/categories/route.ts` |
| `src/app/api/admin/categories/set-streams-active/route.ts` |
| `src/app/api/admin/cdn-ips/route.ts` |
| `src/app/api/admin/cdn-switch/route.ts` |
| `src/app/api/admin/client-logs/route.ts` |
| `src/app/api/admin/collab/route.ts` |
| `src/app/api/admin/commission-report/route.ts` |
| `src/app/api/admin/commissions/route.ts` |
| `src/app/api/admin/connection-map/route.ts` |
| `src/app/api/admin/connections/route.ts` |
| `src/app/api/admin/connections/stream/route.ts` |
| `src/app/api/admin/content-moderation/route.ts` |
| `src/app/api/admin/coupons/route.ts` |
| `src/app/api/admin/credits/route.ts` |
| `src/app/api/admin/dashboard-stream/route.ts` |
| `src/app/api/admin/dashboard-widgets/route.ts` |
| `src/app/api/admin/device-binding/bulk/route.ts` |
| `src/app/api/admin/device-binding/route.ts` |
| `src/app/api/admin/devices/summary/route.ts` |
| `src/app/api/admin/diagnostics/route.ts` |
| `src/app/api/admin/disaster-recovery/route.ts` |
| `src/app/api/admin/domains/certbot/route.ts` |
| `src/app/api/admin/domains/route.ts` |
| `src/app/api/admin/dvr/route.ts` |
| `src/app/api/admin/dynamic-pricing/route.ts` |
| `src/app/api/admin/engagement/route.ts` |
| `src/app/api/admin/enigma/bulk/route.ts` |
| `src/app/api/admin/enigma/route.ts` |
| `src/app/api/admin/epg-sources/route.ts` |
| `src/app/api/admin/epg/[id]/route.ts` |
| `src/app/api/admin/epg/auto-assign/route.ts` |
| `src/app/api/admin/epg/calendar/route.ts` |
| `src/app/api/admin/epg/channels/route.ts` |
| `src/app/api/admin/epg/countries/route.ts` |
| `src/app/api/admin/epg/route.ts` |
| `src/app/api/admin/episodes/route.ts` |
| `src/app/api/admin/expiry-videos/resolve/route.ts` |
| `src/app/api/admin/expiry-videos/route.ts` |
| `src/app/api/admin/failover-testing/route.ts` |
| `src/app/api/admin/groups/ensure-packages/route.ts` |
| `src/app/api/admin/groups/route.ts` |
| `src/app/api/admin/hmac-secret/route.ts` |
| `src/app/api/admin/import-queue/route.ts` |
| `src/app/api/admin/import/folder/route.ts` |
| `src/app/api/admin/import/jobs/route.ts` |
| `src/app/api/admin/import/m3u/route.ts` |
| `src/app/api/admin/import/vod-file/route.ts` |
| `src/app/api/admin/integrations/route.ts` |
| `src/app/api/admin/ip-country/route.ts` |
| `src/app/api/admin/lb-sessions/route.ts` |
| `src/app/api/admin/leak-audit/route.ts` |
| `src/app/api/admin/lines/[id]/connections/route.ts` |
| `src/app/api/admin/lines/[id]/route.ts` |
| `src/app/api/admin/lines/[id]/status/route.ts` |
| `src/app/api/admin/lines/[id]/watch/route.ts` |
| `src/app/api/admin/lines/activity/route.ts` |
| `src/app/api/admin/lines/export/route.ts` |
| `src/app/api/admin/lines/mass/route.ts` |
| `src/app/api/admin/lines/route.ts` |
| `src/app/api/admin/lines/templates/route.ts` |
| `src/app/api/admin/load-balancer/route.ts` |
| `src/app/api/admin/logs/retention/route.ts` |
| `src/app/api/admin/logs/route.ts` |
| `src/app/api/admin/loyalty-program/route.ts` |
| `src/app/api/admin/m3u-sync/route.ts` |
| `src/app/api/admin/mag/bulk/route.ts` |
| `src/app/api/admin/mag/convert-to-line/route.ts` |
| `src/app/api/admin/mag/route.ts` |
| `src/app/api/admin/mass-edit-jobs/[id]/results/route.ts` |
| `src/app/api/admin/mass-edit-jobs/route.ts` |
| `src/app/api/admin/mass-edit/[id]/status/route.ts` |
| `src/app/api/admin/mass-edit/route.ts` |
| `src/app/api/admin/migrate/probe/route.ts` |
| `src/app/api/admin/migrate/route.ts` |
| `src/app/api/admin/migration-jobs/route.ts` |
| `src/app/api/admin/migration/[id]/status/route.ts` |
| `src/app/api/admin/migration/route.ts` |
| `src/app/api/admin/mobile-app/route.ts` |
| `src/app/api/admin/monitor/stream/route.ts` |
| `src/app/api/admin/movies/export/route.ts` |
| `src/app/api/admin/multi-tenancy/route.ts` |
| `src/app/api/admin/mysql-syslog/route.ts` |
| `src/app/api/admin/notifications/[id]/route.ts` |
| `src/app/api/admin/notifications/route.ts` |
| `src/app/api/admin/packages/route.ts` |
| `src/app/api/admin/panel-report/route.ts` |
| `src/app/api/admin/panel-transfer/export/route.ts` |
| `src/app/api/admin/panel-transfer/import/route.ts` |
| `src/app/api/admin/panel-update/progress/route.ts` |
| `src/app/api/admin/panel-update/route.ts` |
| `src/app/api/admin/playback-qoe/route.ts` |
| `src/app/api/admin/portal-urls/route.ts` |
| `src/app/api/admin/processes/route.ts` |
| `src/app/api/admin/profile/route.ts` |
| `src/app/api/admin/profile/totp/route.ts` |
| `src/app/api/admin/profiles/route.ts` |
| `src/app/api/admin/proxies/free/route.ts` |
| `src/app/api/admin/proxies/route.ts` |
| `src/app/api/admin/quality-monitoring/route.ts` |
| `src/app/api/admin/referrals/route.ts` |
| `src/app/api/admin/remote-categories/route.ts` |
| `src/app/api/admin/remote-unlock-ip/route.ts` |
| `src/app/api/admin/remote-update/route.ts` |
| `src/app/api/admin/repair-import/route.ts` |
| `src/app/api/admin/reseller-api-keys/rotate/route.ts` |
| `src/app/api/admin/reseller-api-keys/route.ts` |
| `src/app/api/admin/resellers/bouquets/mass/route.ts` |
| `src/app/api/admin/resellers/bouquets/route.ts` |
| `src/app/api/admin/resellers/route.ts` |
| `src/app/api/admin/resellers/sub/route.ts` |
| `src/app/api/admin/restream-logs/route.ts` |
| `src/app/api/admin/retention/route.ts` |
| `src/app/api/admin/rtmp-ips/route.ts` |
| `src/app/api/admin/rtmp-monitor/route.ts` |
| `src/app/api/admin/same-ip-detection/route.ts` |
| `src/app/api/admin/same-ip-detections/action/route.ts` |
| `src/app/api/admin/same-ip-detections/route.ts` |
| `src/app/api/admin/security-features/route.ts` |
| `src/app/api/admin/series/route.ts` |
| `src/app/api/admin/server-cleaner/route.ts` |
| `src/app/api/admin/server-cleaner/run/route.ts` |
| `src/app/api/admin/server/ports/sync/route.ts` |
| `src/app/api/admin/servers/[id]/agent/route.ts` |
| `src/app/api/admin/servers/[id]/certbot/route.ts` |
| `src/app/api/admin/servers/[id]/metrics/route.ts` |
| `src/app/api/admin/servers/[id]/panel-settings/route.ts` |
| `src/app/api/admin/servers/[id]/route.ts` |
| `src/app/api/admin/servers/bulk/route.ts` |
| `src/app/api/admin/servers/detect/route.ts` |
| `src/app/api/admin/servers/install-job/route.ts` |
| `src/app/api/admin/servers/install-script/route.ts` |
| `src/app/api/admin/servers/interfaces/route.ts` |
| `src/app/api/admin/servers/load-balancer/route.ts` |
| `src/app/api/admin/servers/move-streams/route.ts` |
| `src/app/api/admin/servers/nginx-config/route.ts` |
| `src/app/api/admin/servers/route.ts` |
| `src/app/api/admin/servers/ssh-test/route.ts` |
| `src/app/api/admin/servers/test/route.ts` |
| `src/app/api/admin/servers/traffic/route.ts` |
| `src/app/api/admin/sessions/route.ts` |
| `src/app/api/admin/settings/route.ts` |
| `src/app/api/admin/social/route.ts` |
| `src/app/api/admin/sports/test/route.ts` |
| `src/app/api/admin/sports/upcoming/route.ts` |
| `src/app/api/admin/stack/status/route.ts` |
| `src/app/api/admin/staff/route.ts` |
| `src/app/api/admin/stats/route.ts` |
| `src/app/api/admin/stb-events/route.ts` |
| `src/app/api/admin/stream-errors/route.ts` |
| `src/app/api/admin/stream-fingerprint/route.ts` |
| `src/app/api/admin/stream-fingerprints/deactivate/route.ts` |
| `src/app/api/admin/stream-fingerprints/route.ts` |
| `src/app/api/admin/stream-health/alerts/route.ts` |
| `src/app/api/admin/stream-health/route.ts` |
| `src/app/api/admin/stream-issues/route.ts` |
| `src/app/api/admin/stream-providers/backup-match/route.ts` |
| `src/app/api/admin/stream-providers/channel-search/route.ts` |
| `src/app/api/admin/stream-providers/route.ts` |
| `src/app/api/admin/stream-quality/route.ts` |
| `src/app/api/admin/stream-sources/route.ts` |
| `src/app/api/admin/stream-test/route.ts` |
| `src/app/api/admin/streaming-health/route.ts` |
| `src/app/api/admin/streaming-optimize/route.ts` |
| `src/app/api/admin/streaming-setup/route.ts` |
| `src/app/api/admin/streaming/engine/route.ts` |
| `src/app/api/admin/streams/[id]/connections/route.ts` |
| `src/app/api/admin/streams/[id]/route.ts` |
| `src/app/api/admin/streams/artwork-fill/route.ts` |
| `src/app/api/admin/streams/auto-logos/route.ts` |
| `src/app/api/admin/streams/bulk-backup/route.ts` |
| `src/app/api/admin/streams/duplicate-name-warnings/route.ts` |
| `src/app/api/admin/streams/duplicates/route.ts` |
| `src/app/api/admin/streams/fix-inactive/route.ts` |
| `src/app/api/admin/streams/icon-search/route.ts` |
| `src/app/api/admin/streams/logs/route.ts` |
| `src/app/api/admin/streams/mass/route.ts` |
| `src/app/api/admin/streams/probe-batch/route.ts` |
| `src/app/api/admin/streams/probe/route.ts` |
| `src/app/api/admin/streams/proxy/route.ts` |
| `src/app/api/admin/streams/radio-resolve/route.ts` |
| `src/app/api/admin/streams/remove-duplicates-by-name/route.ts` |
| `src/app/api/admin/streams/route.ts` |
| `src/app/api/admin/streams/upload/route.ts` |
| `src/app/api/admin/theft-detection/route.ts` |
| `src/app/api/admin/tickets/[id]/messages/route.ts` |
| `src/app/api/admin/tickets/[id]/route.ts` |
| `src/app/api/admin/tickets/route.ts` |
| `src/app/api/admin/tmdb-backfill/route.ts` |
| `src/app/api/admin/tmdb-sync/route.ts` |
| `src/app/api/admin/tmdb/detail/route.ts` |
| `src/app/api/admin/tmdb/search/route.ts` |
| `src/app/api/admin/tools/channel-order/route.ts` |
| `src/app/api/admin/tools/mass-delete/route.ts` |
| `src/app/api/admin/tools/provider-urls/route.ts` |
| `src/app/api/admin/tools/remove-foreign-vod/route.ts` |
| `src/app/api/admin/transcoding-profiles/route.ts` |
| `src/app/api/admin/usage-reports/route.ts` |
| `src/app/api/admin/users/mass/route.ts` |
| `src/app/api/admin/users/route.ts` |
| `src/app/api/admin/viewer-heatmap/route.ts` |
| `src/app/api/admin/watch-folders/route.ts` |
| `src/app/api/admin/watch-output/route.ts` |
| `src/app/api/admin/webhooks/route.ts` |
| `src/app/api/admin/whats-on/route.ts` |
| `src/app/api/admin/xdrive-backup/[id]/download/route.ts` |
| `src/app/api/admin/xdrive-backup/route.ts` |
| `src/app/api/agent/ack/route.ts` |
| `src/app/api/agent/heartbeat/route.ts` |
| `src/app/api/agent/poll/route.ts` |
| `src/app/api/artwork/plex/[integrationId]/[itemId]/route.ts` |
| `src/app/api/auth/login/route.ts` |
| `src/app/api/auth/logout/route.ts` |
| `src/app/api/billing/coupon/route.ts` |
| `src/app/api/billing/paypal/capture/route.ts` |
| `src/app/api/billing/paypal/route.ts` |
| `src/app/api/billing/paypal/webhook/route.ts` |
| `src/app/api/billing/webhook/route.ts` |
| `src/app/api/cron/route.ts` |
| `src/app/api/dvr/playback/[username]/[password]/[recordingId]/route.ts` |
| `src/app/api/health/route.ts` |
| `src/app/api/internal/connection-end/route.ts` |
| `src/app/api/internal/connection-pulse-batch/route.ts` |
| `src/app/api/internal/connection-pulse/route.ts` |
| `src/app/api/internal/license-sync/route.ts` |
| `src/app/api/internal/live-auth/route.ts` |
| `src/app/api/internal/panel-hosts/route.ts` |
| `src/app/api/internal/panel-update/route.ts` |
| `src/app/api/internal/playback-event/route.ts` |
| `src/app/api/internal/session-kicked/route.ts` |
| `src/app/api/license/activate/route.ts` |
| `src/app/api/license/enter-panel/route.ts` |
| `src/app/api/license/refresh-session/route.ts` |
| `src/app/api/license/send-activation-code/route.ts` |
| `src/app/api/license/status/route.ts` |
| `src/app/api/license/terms/route.ts` |
| `src/app/api/lines/create/route.ts` |
| `src/app/api/lines/delete/[id]/route.ts` |
| `src/app/api/lines/delete/route.ts` |
| `src/app/api/lines/renew/[id]/route.ts` |
| `src/app/api/lines/renew/route.ts` |
| `src/app/api/lines/route.ts` |
| `src/app/api/lines/status/[id]/route.ts` |
| `src/app/api/lines/status/route.ts` |
| `src/app/api/live/disconnect/route.ts` |
| `src/app/api/metrics/route.ts` |
| `src/app/api/packages/route.ts` |
| `src/app/api/panel-releases/route.ts` |
| `src/app/api/panel/chat/route.ts` |
| `src/app/api/panel/line-ux/route.ts` |
| `src/app/api/panel/notifications/[id]/dismiss/route.ts` |
| `src/app/api/panel/notifications/[id]/read/route.ts` |
| `src/app/api/panel/notifications/bulk/route.ts` |
| `src/app/api/panel/notifications/route.ts` |
| `src/app/api/panel/notifications/unread/route.ts` |
| `src/app/api/panel/url/route.ts` |
| `src/app/api/panel/version/route.ts` |
| `src/app/api/portal/devices/route.ts` |
| `src/app/api/portal/info/route.ts` |
| `src/app/api/portal/login/route.ts` |
| `src/app/api/portal/password/route.ts` |
| `src/app/api/portal/support/route.ts` |
| `src/app/api/public/community-links/route.ts` |
| `src/app/api/public/lb-status/route.ts` |
| `src/app/api/public/white-label/route.ts` |
| `src/app/api/reseller/activity-logs/route.ts` |
| `src/app/api/reseller/api-credentials/route.ts` |
| `src/app/api/reseller/bouquets/route.ts` |
| `src/app/api/reseller/credits/route.ts` |
| `src/app/api/reseller/dashboard-widgets/route.ts` |
| `src/app/api/reseller/epg-preview/route.ts` |
| `src/app/api/reseller/groups/route.ts` |
| `src/app/api/reseller/lines/[id]/connections/route.ts` |
| `src/app/api/reseller/lines/[id]/route.ts` |
| `src/app/api/reseller/lines/[id]/status/route.ts` |
| `src/app/api/reseller/lines/[id]/watch/route.ts` |
| `src/app/api/reseller/lines/mass/route.ts` |
| `src/app/api/reseller/lines/route.ts` |
| `src/app/api/reseller/profile/route.ts` |
| `src/app/api/reseller/stats/route.ts` |
| `src/app/api/reseller/streaming-info/route.ts` |
| `src/app/api/reseller/streams/route.ts` |
| `src/app/api/reseller/tickets/[id]/messages/route.ts` |
| `src/app/api/reseller/tickets/[id]/route.ts` |
| `src/app/api/reseller/tickets/route.ts` |
| `src/app/api/reseller/users/credits/route.ts` |
| `src/app/api/reseller/users/mass/route.ts` |
| `src/app/api/reseller/users/route.ts` |
| `src/app/api/shop/checkout/route.ts` |
| `src/app/api/shop/packages/route.ts` |
| `src/app/api/shop/paypal/capture/route.ts` |
| `src/app/api/v1/route.ts` |
| `src/app/api/webplayer/credentials/route.ts` |
| `src/app/api/webrtc/ice/route.ts` |
| `src/app/api/webrtc/whep/route.ts` |
| `src/app/get.php/route.ts` |
| `src/app/player_api.php/route.ts` |

## Flaky / skipped tests

- **E2E** (`tests/e2e/*.spec.ts`): all skipped — no `.env.test` / `TEST_DATABASE_URL` in this environment.
- **data-layer DB suite**: 13 tests skipped (`hasTestDatabase()` false) — bouquets inheritance, cascades, connections, credits debit, migrate deploy, live schema checks.
- **smoke**: DB-backed cases skip without `TEST_DATABASE_URL`.
- **Load (k6)**: not included in this coverage pass.
- **Flaky unit failures observed**: connection-quality stale timing (2) and `gpu-admission` Prisma when a non-test `DATABASE_URL` is present (1). See gap-closure section.
- E2E / data-layer DB skips as above when `.env.test` is missing.

### Suite exit codes

- `run pretest` → exit 0
- `run test:unit` → exit 1
- `run test:smoke` → exit 0
- `run test:streaming` → exit 0
- `run test:integration` → exit 0
- `run test:data-layer` → exit 0

## Top 15 gaps prioritized (revenue / security)

| # | Gap | Risk | Test plan |
|---|-----|------|-----------|
| 1 | `src/lib/reseller-credit-charge.ts` | Revenue/security — double-spend | Conditional updateMany + insufficient |
| 2 | `src/lib/package-credits.ts` | Revenue — create/renew pricing | Trial/month/year + markup |
| 3 | `src/lib/line-renew-credits.ts` | Revenue — renew debit | Admin free vs reseller charge |
| 4 | `src/lib/internal-request.ts` | Security — internal live-auth | Secret match / prod deny |
| 5 | `src/lib/playback-guard.ts` | Security — playback deny | Expired/banned branches |
| 6 | `src/lib/jwt-secret.ts` | Security — weak JWT | Strength validation |
| 7 | `src/lib/password-hash.ts` | Security — hashing | Hash/verify roundtrip |
| 8 | `src/lib/security-headers.ts` | Security — headers | nosniff + HSTS flag |
| 9 | `src/lib/session-cookie.ts` | Security — cookie flags | httpOnly / sameSite |
| 10 | `src/lib/coupon-redeem.ts` | Revenue — coupon abuse | Validation helpers |
| 11 | `src/lib/reseller-rewards.ts` | Revenue — rebate | Percent clamp |
| 12 | `src/lib/agent-auth.ts` | Security — agent token | Reject bad token |
| 13 | `src/lib/portal-session.ts` | Security — portal auth | Token/expiry helpers |
| 14 | `src/lib/billing.ts / webhook` | Revenue — payments | Signature helpers |
| 15 | `src/lib/license/server-guard.ts` | License gate | Invalid license deny |

Follow-up tests for these gaps land in `src/lib/risk-coverage-gaps.test.ts` (wired into `npm run test:unit`).

## Gap-closure results (focused c8)

After adding **25** risk-gap tests (+ existing SEC regressions), focused coverage on the prioritized modules:

| File | Lines % |
|------|--------:|
| `src/lib/reseller-credit-charge.ts` | 100% |
| `src/lib/package-credits.ts` | 91% |
| `src/lib/line-renew-credits.ts` | 51% |
| `src/lib/internal-request.ts` | 68% |
| `src/lib/playback-guard.ts` | 46% |
| `src/lib/jwt-secret.ts` | 100% |
| `src/lib/password-hash.ts` | 100% |
| `src/lib/security-headers.ts` | 100% |
| `src/lib/session-cookie.ts` | 81% |
| `src/lib/coupon-redeem.ts` | 60% |
| `src/lib/reseller-rewards.ts` | 81% |
| `src/lib/agent-auth.ts` | 100% |
| `src/lib/portal-session.ts` | 53% |
| `src/lib/billing.ts` | 32% (auth gate covered; action handlers need DB) |
| `src/lib/license/server-guard.ts` | 14% (dev bypass covered) |
| `src/lib/free-period.ts` | 100% |

Repo-wide under `--all` remains **12.93%** lines — **344** API route files still at 0% (need injectable handlers / `.env.test` E2E).

### Flaky / failing in full unit run (not skipped)

- `computeConnectionQualityWithLive marks disconnected sessions poor` — assertion failure (time-sensitive).
- `computeConnectionQuality — poor when nearly stale` — assertion failure (time-sensitive).
- `gpu admission rejects when session cap reached` — attempted live Prisma against configured `DATABASE_URL` (refused / unreachable). Treat as environment flake; use mocks + no prod URL.

See also: `SECURITY.md`, `TESTPLAN-blockers.md`.
