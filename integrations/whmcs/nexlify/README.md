# WHMCS module for Nexlify

1. Copy `nexlify.php` into `WHMCS/modules/servers/nexlify/`.
2. On the panel, set `BILLING_WEBHOOK_SECRET` in `.env`.
3. Create a WHMCS product using server module **nexlify** and set:
   - Panel URL (e.g. `https://panel.example.com`)
   - Billing secret (same as panel env)
   - Optional Nexlify `package_id`

Provisioning uses `POST /api/billing/provision` with operations: `createLine`, `extendLine`, `suspendLine`, `unsuspendLine`, `terminateLine`.

Legacy integrations may continue to use `POST /api/billing/webhook` with `action: create|renew|suspend|…`.
