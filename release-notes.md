## v1.8.4 — Critical install and repair fixes

### Features
- New `customer-setup.sh` — one-command database fix, prisma sync, server registration, nginx, and PM2
- New `repair-panel.sh` — quick repair for DB credentials, schema sync, and server registration
- New `cleanup-customer-server.sh` — full cleanup script for all common deployment issues

### Bug fixes
- Fix shell `DATABASE_URL` override — scripts now unset stale env before prisma to prevent auth failures
- Fix standalone `.env` `PANEL_REPO_PATH` — build-time path no longer baked into standalone
- Copy `package.json` into standalone dir — version API no longer returns ENOENT on customer servers
- `deploy-vps.sh` and `install-linux.sh` now unset `DATABASE_URL` before prisma
- `prepare-standalone.sh` strips `PANEL_REPO_PATH` from standalone `.env` after build
- Main server now auto-registered in Manage Servers after fresh install

### Notes
- Update button now works on tarball-installed panels
- Back up PostgreSQL before applying: `pg_dump nexlify > backup.sql`
