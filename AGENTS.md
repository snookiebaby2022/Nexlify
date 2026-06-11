# AGENTS.md

## Cursor Cloud specific instructions

Nexlify is a single Next.js 15 (App Router) IPTV/OTT management panel backed by PostgreSQL (via Prisma) with an optional Redis cache. Everything runs from the repo root; there are no workspaces. There is no automated test suite — validation is manual (demo logins, the `/api/health` endpoint, and UI flows).

### Services and how to run them
The update script (`npm install`) only refreshes dependencies. It does NOT start services. Each session you must start them yourself:

- **PostgreSQL + Redis** (Docker, defined in `docker-compose.yml`): start the daemon then the containers.
  - `sudo service docker start` (Docker is installed but the daemon is not auto-started).
  - `sudo docker compose up -d` (Postgres on `5432`, Redis on `6379`, credentials `nexlify/nexlify`, db `nexlify`).
  - Docker uses the `fuse-overlayfs` storage driver and iptables-legacy in this VM (already configured under `/etc/docker/daemon.json`).
- **Nexlify panel (dev):** `npm run dev` (Next dev server on `http://localhost:3000`, binds `0.0.0.0`). Port comes from `PORT` in `.env` via `scripts/run-next.mjs`.
- **Build / lint:** `npm run build`, `npm run lint` (lint emits warnings only; exit 0). See `package.json` for the full script list (`db:push`, `db:seed`, `cron`, `license:*`, etc.).

### Non-obvious setup notes
- **`.env` is gitignored** and must exist. Create it from `.env.example` (`cp .env.example .env`). The default `DATABASE_URL` and `REDIS_URL` already match the Docker Compose services.
- **License gate:** the admin/reseller UI is behind a license check in `src/middleware.ts`. `NEXLIFY_LICENSE_SKIP=1` is documented in README but does NOT work (the env-exempt check returns false). For local dev, set **`NEXLIFY_LICENSE_VALID=1`** in `.env` to bypass the gate (otherwise admin routes redirect to `/admin/license`).
- **First-run DB setup** (only needed once per fresh database, not every session): `npx prisma db push` then `npm run db:seed`. Seed creates logins — **admin/admin123**, **reseller/reseller123**, demo line **demo/demo123**. The Postgres volume persists across container restarts, so reseed only after wiping the volume.
- **Node:** repo `.nvmrc` pins Node 20, but the VM's default `node` (v22, at `/exec-daemon/node`) takes PATH precedence over nvm and is fully compatible with Next 15.5 (engines requires only `>=18.17.0`). Just use the default node.
- **Health check:** `curl http://localhost:3000/api/health` returns `{"status":"healthy", checks:{app,database,redis}}` once everything is up.
- **README.md currently contains an unresolved git merge conflict** (markers around lines 2/242). This is pre-existing and unrelated to setup.
