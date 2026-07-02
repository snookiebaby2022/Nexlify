#!/bin/bash
set -euo pipefail
python3 /tmp/patch-marketing-gtm.py
cd /var/www/nexlify
npm run build
pm2 restart nexlify-web --update-env
echo "GTM deployed — container GTM-KTQ4K29X"
