#!/bin/bash
set -euo pipefail
KEY="$(openssl rand -hex 24)"
sudo -u postgres psql -d nexlify -c "UPDATE \"PanelUser\" SET \"apiKey\" = '${KEY}' WHERE username = 'admin' AND role = 'ADMIN' RETURNING username;"
echo "FULL_API_KEY=${KEY}"
curl -s -m 10 "http://127.0.0.1:13000/api/v1?api_key=${KEY}&action=get_bouquets" | head -c 200
echo
