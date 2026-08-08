# Nexlify sync — GitHub, local PC, and VPS

Three places hold Nexlify files. This doc defines what belongs where and how to keep them aligned.

## Canonical source (GitHub + local clone)

| Path | Purpose |
|------|---------|
| `src/` | IPTV panel app |
| `scripts/` | Panel ops, installers, VPS repair (**edit installers here only**) |
| `marketing-drop-in/` | Marketing site (deploys flat to `/var/www/nexlify`) |
| `prisma/`, `nginx/`, `docs/` | Shared config and docs |

**Not in git** (generated locally or on VPS):

- `marketing-drop-in/scripts/vps-full-update.sh` — run `bash scripts/nexlify-sync-all.sh` to generate, then WinSCP to VPS
- `public/downloads/nexlify-panel.tar.gz` — built on VPS via `publish-panel-release.sh`
- `node_modules/`, `.next/`, `.env`, `.license-keys/`

## After every `git pull` on your PC

```powershell
cd C:\Users\lizzi\nexlify-panel
git pull origin main
bash scripts/nexlify-sync-all.sh
```

Or on Git Bash / WSL:

```bash
npm run sync:all
```

This syncs panel releases → marketing, installer scripts → `public/install/`, and regenerates `vps-full-update.sh`.

## VPS layout

| VPS path | Source |
|----------|--------|
| `/home/nexlify-panel` | `git pull` + `./scripts/deploy-vps.sh` |
| `/var/www/nexlify` | Upload `vps-full-update.sh` → `bash /root/vps-full-update.sh` |
| `/var/www/nexlify/public/downloads/` | `bash scripts/publish-panel-release.sh` |
| `/var/www/nexlify/.env` | Secrets only on VPS (never git) |

## Full VPS align + cleanup

```bash
# 1. Panel — latest from git
cd /home/nexlify-panel && git pull origin main && ./scripts/deploy-vps.sh

# 2. Marketing — upload newest vps-full-update.sh from PC, then:
bash /root/vps-full-update.sh

# 3. Panel tarball + installer URLs
cd /home/nexlify-panel && bash scripts/publish-panel-release.sh

# 4. Cleanup temp/backup junk
bash /home/nexlify-panel/scripts/nexlify-vps-cleanup.sh

# 5. Verify
bash /root/nexlify-full-platform-audit.sh
```

## Local cleanup (PC)

```bash
bash scripts/nexlify-local-cleanup.sh
# Optional — remove node_modules etc.:
git clean -fdX
```

## One-command checklist

| Step | Local | VPS |
|------|-------|-----|
| Source code | `git pull origin main` | Panel: `git pull` |
| Sync artifacts | `npm run sync:all` | `bash vps-full-update.sh` |
| Publish downloads | — | `publish-panel-release.sh` |
| Audit | — | `nexlify-full-platform-audit.sh` |
| Cleanup | `npm run cleanup:local` | `nexlify-vps-cleanup.sh` |
