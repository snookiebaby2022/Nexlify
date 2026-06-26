# Automatic website updates

Two ways to update **nexlify.live** without a full manual deploy.

---

## Option 1: GitHub Actions (recommended)

Every `git push` to `main` deploys automatically.

### Setup (one time)

1. Push this project to GitHub.

2. Add repository **Secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |--------|--------|
   | `VPS_HOST` | `85.17.162.54` |
   | `VPS_USER` | `root` |
   | `VPS_SSH_KEY` | Your **private** SSH key (full content of `id_ed25519`) |
   | `VPS_REMOTE_PATH` | `/var/www/nexlify` (optional) |

3. Get private key on Windows:
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519
   ```
   Copy everything including `-----BEGIN` / `-----END` lines into `VPS_SSH_KEY`.

4. First deploy on VPS must already be done once:
   ```powershell
   npm run deploy
   ```

### Daily workflow

```powershell
git add .
git commit -m "Update site"
git push
```

GitHub runs `.github/workflows/deploy-nexlify.yml` → uploads → `remote-update.sh` → PM2 restart.

Watch progress: GitHub → **Actions** tab.

Manual trigger: Actions → **Deploy to nexlify.live** → **Run workflow**.

---

## Option 2: One command from Windows

After code changes, without GitHub:

```powershell
npm run deploy:update
```

Runs `remote-update.sh` only (faster than full install).

---

## Option 3: Git hook (auto on every commit)

```powershell
cd C:\Users\lizzi\Projects\stream-billing
powershell -ExecutionPolicy Bypass -File deploy/install-git-hook.ps1
```

After that, each `git commit` on this machine runs `deploy:update` (requires SSH key).

To remove: delete `.git/hooks/post-commit`.

---

## What gets updated

- Next.js site on port **3001**
- nginx config refreshed
- Database migrations (`prisma db push`)
- PM2 restart

IPTV panel on **3000** is not restarted.
