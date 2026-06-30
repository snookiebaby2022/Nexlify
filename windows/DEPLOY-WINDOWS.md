# Deploy from Windows (WinSCP + PuTTY)

This **`windows/`** folder is only for your PC. It is **not** uploaded to the VPS (WinSCP excludes it).

Automatically sync the main project to your VPS and build + restart the panel.

## One-time setup

### 1. Install tools

- [WinSCP](https://winscp.net/) — file sync
- [PuTTY](https://www.putty.org/) — remote commands (`plink.exe`)

### 2. SSH key (recommended)

1. PuTTYgen → Generate → Save private key → `nexlify.ppk`
2. Copy the public key into the VPS: `~/.ssh/authorized_keys`
3. Test in PuTTY with the `.ppk` under **Connection → SSH → Auth**

### 3. Config file

In this folder (`nexlify-panel\windows\`):

```powershell
cd C:\Users\lizzi\nexlify-panel\windows
Copy-Item deploy.config.example.json deploy.config.json
notepad deploy.config.json
```

| Field | Example |
|-------|---------|
| `host` | `85.17.162.54` |
| `username` | `root` |
| `remotePath` | `/home/nexlify-panel` |
| `privateKey` | `C:/Users/lizzi/Documents/.ssh/nexlify.ppk` (use `/`, not `\`, in JSON) |

`deploy.config.json` is gitignored.

### 4. First VPS setup (once)

```bash
mkdir -p /home/nexlify-panel
# After first deploy:
cd /home/nexlify-panel && cp .env.example .env && nano .env
```

---

## Deploy (every code change)

**Double-click** `windows\deploy.bat`  
or:

```powershell
cd C:\Users\lizzi\nexlify-panel\windows
.\scripts\deploy-from-windows.ps1
```

1. Syncs the **parent** project folder (not `windows/`)
2. Runs `deploy-vps.sh` on the server (install, db push, build, PM2)

### Other commands

```powershell
cd C:\Users\lizzi\nexlify-panel\windows

.\scripts\deploy-from-windows.ps1 -SyncOnly
.\scripts\deploy-from-windows.ps1 -RemoteOnly
.\scripts\remote-deploy.ps1 -Pm2Only
```

### Scheduled auto-deploy (optional)

Task Scheduler → Action:

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\lizzi\nexlify-panel\windows\scripts\deploy-from-windows.ps1"
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `deploy.config.json not found` | Create it in **`windows/`**, not project root |
| `Unrecognized escape sequence` | Use forward slashes in `privateKey` (see example config) |
| `webpack errors` / `node-cron` | On VPS: `rm -f src/instrumentation.ts src/lib/cron-scheduler.ts` then redeploy |
| Build fails, unclear error | SSH: `cd /home/nexlify-panel && npm run build` and read full output |
| Red `NativeCommandError` on SWC warning | Harmless stderr from plink — fixed in `remote-deploy.ps1`; check plink exit code |
| `lockfile missing swc dependencies` | Run deploy again (installs `@next/swc-linux-x64-gnu` on Linux) |
| WinSCP / plink not found | Install tools or set paths in config |
| Host key rejected | Connect once in PuTTY/WinSCP, or `"acceptHostKey": true` |
| PM2 `nexlify not found` | First deploy runs `pm2-start.sh` on the server |

---

## What gets synced

From `nexlify-panel\` (parent of this folder): `src/`, `prisma/`, `scripts/`, etc.

**Excluded:** `node_modules/`, `.next/`, `.git/`, `.env`, **`windows/`**
