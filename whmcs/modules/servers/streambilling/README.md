# WHMCS — StreamForge Panel License Module

Automates IPTV panel license keys when customers order through WHMCS.

## Install

1. Copy `streambilling` to your WHMCS path:
   ```
   /path/to/whmcs/modules/servers/streambilling/
   ```

2. On your **StreamBilling** site (`.env`):
   ```
   WHMCS_API_SECRET=long-random-secret
   NEXT_PUBLIC_WHMCS_URL=https://billing.nexlify.live/cart.php
   ```

3. Map each WHMCS product ID to a plan (`whmcsProductId` in database / seed).

4. In **WHMCS Admin** → Products → your panel product:
   - **Module**: StreamForge Panel License
   - **Server**: Add a "server" entry:
     - **Module**: StreamForge Panel License
     - **Hostname**: `nexlify.live` (hostname only — **do not** enter `https://`)
     - **Port**: `443`
     - **Secure / SSL**: enabled
     - **Password**: same as `WHMCS_API_SECRET`

5. Module config **Product ID**: WHMCS product ID (must match plan mapping).

### Plugin addon products (IDs 4–12)

Create separate WHMCS products for each plugin using the **same** module and server:

| WHMCS product ID | Plugin |
|------------------|--------|
| 4 | Plex |
| 5 | Emby |
| 6 | Jellyfin |
| 7 | YouTube |
| 8 | Spotify |
| 9 | Apple Music |
| 10 | Deezer |
| 11 | YouTube Music |
| 12 | Statistics |

Product ID 13 (Proxy plugins) is retired — proxy tooling is built into the IPTV panel.

On `create`, the API returns `type: "addon"` (no panel license key). The module writes service notes like `Panel addon: Plex (plex)`. The customer’s IPTV panel syncs entitlements on license activation via `GET /api/licenses/addons?key=XSTR-…`.

## Lifecycle

| WHMCS action | API action | Effect |
|--------------|------------|--------|
| Create | `create` | Issues `XSTR-…` key, links `serviceId` |
| Renew | `renew` | Extends expiry |
| Suspend | `suspend` | Key status → SUSPENDED |
| Unsuspend | `unsuspend` | Key re-enabled |
| Terminate | `terminate` | Key → REVOKED |

## Show license in WHMCS client area

Use a **Product Custom Field** or email template with hook:

After `CreateAccount`, WHMCS receives `licenseKey` in API response. Store it via:

- WHMCS hook `AfterModuleCreate` writing to service notes, or
- Custom field `panel_license_key` updated via local API

Example hook (place in `/includes/hooks/streambilling_license.php`):

```php
<?php
add_hook('AfterModuleCreate', 1, function ($vars) {
    if ($vars['params']['moduletype'] !== 'streambilling') return;
    // License key is returned in module log — configure email template to include custom field
});
```

## Panel activation

Customer copies key from WHMCS email / client area → enters in your IPTV panel → panel calls:

`POST /api/licenses/validate` with `x-panel-api-key`.
