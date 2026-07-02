# WHMCS integration

## Webhook (any billing system)

```http
POST https://your-panel/api/billing/webhook
X-Billing-Secret: your-secret
Content-Type: application/json
```

Actions: `create`, `suspend`, `unsuspend`, `terminate`, `renew`

## WHMCS module (recommended)

1. **Admin → Billing** — download `nexlify-whmcs-module.zip`, or run `npm run package:whmcs` on the panel host.
2. Extract to `WHMCS_ROOT/modules/servers/nexlify/`.
3. Add server in WHMCS with module **Nexlify IPTV Panel**.
4. Configure:
   - **Panel URL** — public Nexlify URL
   - **Webhook secret** — matches `BILLING_WEBHOOK_SECRET`
   - **Default bouquet IDs** — from Admin → Bouquets
   - **Subscription days** / **Max connections**

WHMCS `serviceid` maps to Nexlify line `externalId` for suspend/renew/terminate.

## Client area template

The module ships `templates/clientarea.tpl` with M3U and Xtream URLs for end users.
