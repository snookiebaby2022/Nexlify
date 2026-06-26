# Deploy Nexlify to your VPS (85.17.162.54)

## 1. DNS

Point these records to **85.17.162.54**:

| Record | Type | Value |
|--------|------|--------|
| `nexlify.live` | A | `85.17.162.54` |
| `www` | A or CNAME | `85.17.162.54` / `nexlify.live` |
| `panel` | A | `85.17.162.54` |
| `panel.demo` | A | `85.17.162.54` |

## 2. SSH key (one time, on your PC)

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519 -N '""'
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@85.17.162.54 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Enter your VPS root password when prompted.

## 3. Deploy from project folder

```powershell
cd C:\Users\lizzi\Projects\stream-billing
npm run deploy:vps
```

This uploads the app, installs Node/nginx/PM2, builds on Linux, and starts the website on port **3001** (panel stays on **3000**).

## 4. HTTPS (after DNS propagates)

```bash
apt update
apt install -y certbot python3-certbot-nginx
certbot --nginx -d nexlify.live -d www.nexlify.live
```

## 5. Check

- http://85.17.162.54
- https://nexlify.live (after SSL)
- Admin: credentials printed at end of install, or read `/var/www/nexlify/.env` on server

```bash
ssh root@85.17.162.54 "grep ADMIN /var/www/nexlify/.env"
pm2 logs nexlify
pm2 status
```

## Manual reinstall on server

```bash
cd /var/www/nexlify && bash deploy/remote-install.sh
```

## Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```
