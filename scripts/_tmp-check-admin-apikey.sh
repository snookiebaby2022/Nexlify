#!/bin/bash
set -euo pipefail
sudo -u postgres psql -d nexlify -c "
SELECT username, role, \"isActive\",
       CASE WHEN \"apiKey\" IS NULL THEN 'NULL' ELSE left(\"apiKey\", 12) || '...' END AS api_key_preview,
       \"accessCode\"
FROM \"PanelUser\"
WHERE role IN ('ADMIN', 'STAFF')
ORDER BY role, username;
"
