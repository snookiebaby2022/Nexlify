#!/bin/bash
set -euo pipefail
ENV_FILE="/var/www/nexlify/.env"
GA_FILE="/tmp/ga-measurement-id.txt"

if [ -f "$GA_FILE" ]; then
  GA_ID="$(tr -d '\r\n' < "$GA_FILE")"
  if [ -n "$GA_ID" ]; then
    if grep -q '^NEXT_PUBLIC_GA_MEASUREMENT_ID=' "$ENV_FILE"; then
      sed -i "s/^NEXT_PUBLIC_GA_MEASUREMENT_ID=.*/NEXT_PUBLIC_GA_MEASUREMENT_ID=${GA_ID}/" "$ENV_FILE"
    else
      echo "NEXT_PUBLIC_GA_MEASUREMENT_ID=${GA_ID}" >> "$ENV_FILE"
    fi
    echo "Set GA measurement ID in .env"
  fi
else
  grep -q '^NEXT_PUBLIC_GA_MEASUREMENT_ID=' "$ENV_FILE" \
    || echo '# NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX' >> "$ENV_FILE"
fi

python3 /tmp/patch-marketing-google-analytics.py
cd /var/www/nexlify
npm run build
pm2 restart nexlify-web --update-env
echo "nexlify-web restarted"
