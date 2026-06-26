# Install without SSH from Windows

Use this when `ssh root@85.17.162.54` shows **Permission denied**.

## A. Fix SSH (optional, for later deploys)

### Hosting panel (easiest)

Many VPS providers (OVH, Hetzner, Contabo, etc.) have **SSH Keys** in the control panel.

1. On Windows:
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
2. Copy the full line → paste into panel → attach to server **85.17.162.54** → reboot if asked.
3. Test: `ssh root@85.17.162.54 "echo OK"`

### Web console

1. Open **browser console** for 85.17.162.54 (not SSH from PC).
2. Edit `deploy/add-ssh-key.sh` — paste your public key into `PUBKEY="..."`.
3. Upload the file or paste script contents and run:
   ```bash
   bash add-ssh-key.sh
   ```

### Enable root password (if panel allows)

Some images disable password login. In panel: reset root password, enable “Password authentication” in SSH settings, then:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@85.17.162.54 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

---

## B. Install Nexlify via web console (no SSH)

### 1. Create archive on Windows

```powershell
cd C:\Users\lizzi\Projects\stream-billing
powershell -File deploy\make-archive.ps1
```

File: `%TEMP%\nexlify-deploy.tar.gz`

### 2. Upload via VPS file manager

Upload to **`/tmp/nexlify-deploy.tar.gz`** on 85.17.162.54.

### 3. Run in web console

```bash
mkdir -p /var/www/nexlify
cd /var/www/nexlify
tar -xzf /tmp/nexlify-deploy.tar.gz
bash deploy/console-bootstrap.sh
```

### 4. DNS + SSL (required for https://)

- Point **nexlify.live** → **85.17.162.54**
- **http://** works on port 80; **https://** needs SSL on port 443:

```bash
bash /var/www/nexlify/deploy/enable-ssl.sh
```

Or manually: `certbot --nginx -d nexlify.live` (skip `www` until www DNS exists).

### 5. Admin password

```bash
grep ADMIN /var/www/nexlify/.env
pm2 status
```

Site: http://85.17.162.54

---

## C. `repair-site.sh: No such file` — fix

That error means the **deploy folder was never uploaded** or you are not in `/var/www/nexlify`.

**Check on the VPS:**

```bash
ls -la /var/www/nexlify/package.json
ls -la /var/www/nexlify/deploy/
```

- If `package.json` is missing → do **section B** (upload `nexlify-deploy.tar.gz` first).
- If `package.json` exists but `deploy/` is missing → re-extract the archive (section B step 3).

**Repair without the file** (paste the whole block in the web console):

```bash
bash -s <<'REPAIR'
set -euo pipefail
APP_DIR="/var/www/nexlify"
cd "$APP_DIR" || { echo "Missing $APP_DIR — upload nexlify-deploy.tar.gz first"; exit 1; }
[ -f package.json ] || { echo "No package.json in $APP_DIR"; exit 1; }
[ -f deploy/ecosystem.config.cjs ] || { echo "deploy/ missing — upload and extract nexlify-deploy.tar.gz to $APP_DIR"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs build-essential; }
command -v nginx >/dev/null || apt-get update && apt-get install -y nginx
command -v pm2 >/dev/null || npm install -g pm2

touch .env
grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3001/' .env || echo 'PORT=3001' >> .env
grep -q '^HOSTNAME=' .env || echo 'HOSTNAME=0.0.0.0' >> .env
grep -q '^NEXT_PUBLIC_APP_URL=' .env || echo 'NEXT_PUBLIC_APP_URL=https://nexlify.live' >> .env
grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

DB_FILE="$APP_DIR/data/nexlify.db"
grep -q '^DATABASE_URL=' .env && sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${DB_FILE}|" .env || echo "DATABASE_URL=file:${DB_FILE}" >> .env
export DATABASE_URL="file:${DB_FILE}"

npm ci
npx prisma generate
mkdir -p data
npx prisma db push 2>/dev/null || npx prisma db push --accept-data-loss
npm run db:seed 2>/dev/null || true
npm run build

pm2 delete nexlify 2>/dev/null || true
export NEXLIFY_DIR="$APP_DIR"
pm2 start "$APP_DIR/deploy/ecosystem.config.cjs"
pm2 save

cp "$APP_DIR/deploy/nginx-nexlify.conf" /etc/nginx/sites-available/nexlify.live
ln -sf /etc/nginx/sites-available/nexlify.live /etc/nginx/sites-enabled/nexlify.live
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t && systemctl restart nginx

sleep 2
curl -sI http://127.0.0.1:3001 | head -1
curl -s http://127.0.0.1:3001/api/health 2>/dev/null || true
pm2 status nexlify
echo "Done."
REPAIR
```

After a successful upload, you can use:

```bash
bash /var/www/nexlify/deploy/repair-site.sh
```
