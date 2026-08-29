#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
SECRETS=$(ls -t /root/.nexlify-75-secrets-*.env 2>/dev/null | head -1)
# shellcheck disable=SC1090
source "$SECRETS"
PW="$POSTGRES_PASSWORD"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER nexlify WITH PASSWORD '${PW}';"
BACKUP=$(ls -td /opt/nexlify-panel-backups/pre-harden-* 2>/dev/null | head -1)
OLD_URL=$(grep '^DATABASE_URL=' "$BACKUP/env" | cut -d= -f2-)
node -e "
const fs = require('fs');
const u = new URL(process.argv[1]);
u.password = process.argv[2];
const line = 'DATABASE_URL=' + u.toString();
let env = fs.readFileSync('.env', 'utf8');
env = env.replace(/^DATABASE_URL=.*/m, line);
fs.writeFileSync('.env', env);
" "$OLD_URL" "$PW"
chmod 600 .env
npx prisma migrate deploy
npm run build
bash scripts/panel-restart-safe.sh --nexlify-only
pm2 restart nexlify-cron --update-env
pm2 restart nexlify-iptv-edge --update-env
pm2 save
curl -fsS -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:13000/api/health
ss -lntp | grep 8787 && echo WARN_license_port || echo license_closed
echo DEPLOY_75_OK
