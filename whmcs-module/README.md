# Nexlify WHMCS module

## Install

1. Build or download `nexlify-whmcs-module.zip` from the panel (Admin → Billing → WHMCS module) or run `npm run package:whmcs`.
2. Extract so you have `modules/servers/nexlify/nexlify.php` under your WHMCS root.
3. In WHMCS: **Setup → Products/Services → Servers → Add New Server**
   - Type: **Nexlify IPTV Panel**
   - Panel URL: `https://your-nexlify-host`
   - Webhook secret: same as `BILLING_WEBHOOK_SECRET` in Nexlify `.env`
   - Default bouquet IDs: comma-separated IDs from Nexlify Admin → Bouquets
4. Create a product and assign this server module.

## Hooks

| WHMCS function | Nexlify action |
|----------------|----------------|
| CreateAccount | `create` |
| SuspendAccount | `suspend` |
| UnsuspendAccount | `unsuspend` |
| TerminateAccount | `terminate` |
| Renew (custom) | `renew` |

`service_id` is the WHMCS service ID (stored as line `externalId`).

## Client area

Shows username, password, M3U link, and Xtream API URL in the service details page.

## Renew button

Add a custom action or button in WHMCS that calls module function `Renew`, or use the included hook in your automation rules calling the renew API manually.
