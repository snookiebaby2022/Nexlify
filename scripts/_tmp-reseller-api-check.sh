#!/bin/bash
sudo -u postgres psql -d nexlify -tAc "SELECT role, count(id) FROM \"PanelUser\" WHERE \"isActive\" AND role IN ('RESELLER','SUB_RESELLER') GROUP BY role"
echo "with_api_key=$(sudo -u postgres psql -d nexlify -tAc "SELECT count(id) FROM \"PanelUser\" WHERE role IN ('RESELLER','SUB_RESELLER') AND \"apiKey\" IS NOT NULL")"
sudo -u postgres psql -d nexlify -tAc "SELECT name, left(config::text,120) FROM \"ResellerGroup\" LIMIT 5"
