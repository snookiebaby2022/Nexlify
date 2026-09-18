# Cursor prompts for nexlify-panel

Use these in **Chat** or **Inline (Ctrl+K)** with `@` scoping. Cursor indexes the local git tree — remote server fixes still land here first, then deploy.

## How Cursor fits this repo

| Layer | What it can do |
|--------|----------------|
| Local `@` / graft | Refactors, tracing, tests against `scripts/` and `src/` |
| Agent shell | SSH to ops hosts, run `scripts/diag-*`, `scripts/verify-*` (with your keys) |
| Not automatic | Cursor does not mount `/opt/nexlify-lb/php` unless you sync or paste logs |

**Stack:** Next.js + Prisma + Postgres + Redis; Xtream shims in `scripts/panel-php/php`; classic LB in `scripts/classic-lb/php` (nginx `auth_request` → PHP → shared FFmpeg HLS + per-client MPEG-TS).

---

## Architecture / playback

```
@scripts/classic-lb @src/lib Explain the live zap path for /live/user/pass/id.ts: auth_request, when shared HLS starts, when mpegts uses hls-seg vs direct remux. Cite file:line spans.
```

```
graft ask "how does classic-lb auth.php decide m3u8 wait vs ts no-wait" --source
```

```
@scripts/classic-lb/php/mpegts.php @scripts/classic-lb/php/auth.php Why would X-Nexlify-Remux stay direct on a warm channel? List conditions and minimal fixes.
```

```
@scripts/classic-lb Trace X-Nexlify-Deny: ffmpeg_pending from nginx through auth and mpegts.
```

---

## Security

```
@src @scripts Find hardcoded stream URLs, JWT secrets, or production DB hosts in source (exclude .env). Flag logging of passwords or playlist tokens.
```

```
@src/lib Review reseller/line isolation: where can one reseller read another's lines, streams, or connections?
```

---

## Xtream compatibility

```
@scripts/panel-php/php Compare player_api.php and get.php to Xtream expectations for live/VOD/series. List response keys clients depend on.
```

---

## Debug from a symptom

```
Error/log: [paste exact text]
Trace from nginx → PHP → panel API/DB on classic-lb topology. Suggest one existing scripts/diag-* or curl probe — no new one-offs.
```

---

## Performance

```
@src @prisma Find N+1 or unbounded queries on streams, lines, connections, EPG hot paths. Suggest indexes or batching matching existing patterns.
```

---

## Remote verification (agent + SSH)

```
SSH with ~/.ssh/nexlify_deploy to the LB host: /lb/health on :8090, warm .ts TTFB, diff /opt/nexlify-lb/php vs scripts/classic-lb/php for auth.php and mpegts.php. Summarize only.
```

Scripts: `scripts/classic-lb/measure-zap-ttfb.sh`, `scripts/verify-50k-tune-75.sh`.

---

## Pro tips

- Zap/buffering: `@scripts/classic-lb/php/auth.php`, `mpegts.php`; URLs/tokens: `src/lib/*playback*`.
- Tests: `.cursor/rules/testing.mdc` — no real FFmpeg/network/prod DB in `src/**/*.test.ts`.
- MCP Postgres: `TEST_DATABASE_URL` / dev only.
- Prefer **minimal diffs** matching repo conventions.

---

## Operator scripts (credentials)

Never commit real line passwords or production host IPs in `scripts/`.

- Copy `scripts/fixtures/playback-fixture.example.json` → `/root/.nexlify-75-playback-fixture.json` on the panel/LB host (or set `NEXLIFY_PLAYBACK_FIXTURE_FILE`).
- Generate on-host: `node scripts/ensure-smoke-playback.cjs` (uses DB + probed-ok stream).
- Source `scripts/lib/load-playback-fixture.sh` in bash diag/deploy scripts; deploy SSH targets use `DEPLOY_HOST` (no default IP in git).

---

## Live `.ts` zap (reference)

1. **Nginx** — `auth_request /lb/auth` → `mpegts.php` with `X-Nexlify-Safe` (`scripts/classic-lb/nginx-lb.conf`).
2. **auth.php** — `panel_live_auth`; live calls `ensure_ffmpeg`; **only `.m3u8`** waits on `AUTH_READY_WAIT_MS`.
3. **ensure_ffmpeg** — one shared HLS packager per channel; writes `sources/{safe}.url` for cold direct remux.
4. **mpegts.php** — warm: **`hls-seg`** (concat `seg*.ts`); cold: **`direct`** FFmpeg `-c copy`; no mid-stream HLS hop after bytes sent.

Headers to watch: `X-Nexlify-Remux`, `X-Nexlify-Deny`, `X-Nexlify-Hls-Ready`.
