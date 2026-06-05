<?php
/**
 * Nexlify IPTV — WHMCS provisioning module
 *
 * Upload the `nexlify` folder to: WHMCS_ROOT/modules/servers/nexlify/
 * Activate in Setup → Products/Services → Servers → Add Server → Module: Nexlify
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

function nexlify_MetaData()
{
    return [
        'DisplayName' => 'Nexlify IPTV Panel',
        'APIVersion' => '1.1',
        'RequiresServer' => false,
    ];
}

function nexlify_ConfigOptions()
{
    return [
        'Panel URL' => [
            'Type' => 'text',
            'Size' => '64',
            'Description' => 'e.g. https://panel.example.com (no trailing slash)',
        ],
        'Webhook secret' => [
            'Type' => 'password',
            'Size' => '64',
            'Description' => 'Same as BILLING_WEBHOOK_SECRET on the Nexlify panel',
        ],
        'Default bouquet IDs' => [
            'Type' => 'text',
            'Size' => '64',
            'Description' => 'Comma-separated Nexlify bouquet IDs for new lines',
        ],
        'Subscription days' => [
            'Type' => 'text',
            'Size' => '8',
            'Default' => '30',
        ],
        'Max connections' => [
            'Type' => 'text',
            'Size' => '4',
            'Default' => '1',
        ],
    ];
}

function nexlify_call(array $params, array $payload)
{
    $url = rtrim($params['configoption1'] ?? '', '/') . '/api/billing/webhook';
    $secret = $params['configoption2'] ?? '';

    $payload['service_id'] = (string) ($params['serviceid'] ?? $payload['service_id'] ?? '');
    if (!empty($params['username'])) {
        $payload['username'] = $params['username'];
    }
    if (!empty($params['password'])) {
        $payload['password'] = $params['password'];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Billing-Secret: ' . $secret,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        return ['ok' => false, 'error' => 'cURL: ' . $err];
    }

    $json = json_decode((string) $body, true);
    if (!is_array($json)) {
        return ['ok' => false, 'error' => 'Invalid JSON (HTTP ' . $code . ')'];
    }
    if ($code >= 400 || empty($json['ok'])) {
        return ['ok' => false, 'error' => $json['error'] ?? ('HTTP ' . $code)];
    }
    return $json;
}

function nexlify_bouquet_ids(array $params)
{
    $raw = $params['configoption3'] ?? '';
    $ids = array_values(array_filter(array_map('trim', explode(',', $raw))));
    return $ids;
}

function nexlify_CreateAccount(array $params)
{
    $days = (int) ($params['configoption4'] ?? 30);
    $max = (int) ($params['configoption5'] ?? 1);
    $username = $params['username'] ?: ('u' . $params['serviceid']);
    $password = $params['password'] ?: bin2hex(random_bytes(4));

    $result = nexlify_call($params, [
        'action' => 'create',
        'username' => $username,
        'password' => $password,
        'days' => $days > 0 ? $days : 30,
        'max_connections' => $max > 0 ? $max : 1,
        'bouquet_ids' => nexlify_bouquet_ids($params),
    ]);

    if (empty($result['ok'])) {
        return $result['error'] ?? 'Create failed';
    }

    return 'success';
}

function nexlify_SuspendAccount(array $params)
{
    $result = nexlify_call($params, ['action' => 'suspend']);
    return empty($result['ok']) ? ($result['error'] ?? 'Suspend failed') : 'success';
}

function nexlify_UnsuspendAccount(array $params)
{
    $result = nexlify_call($params, ['action' => 'unsuspend']);
    return empty($result['ok']) ? ($result['error'] ?? 'Unsuspend failed') : 'success';
}

function nexlify_TerminateAccount(array $params)
{
    $result = nexlify_call($params, ['action' => 'terminate']);
    return empty($result['ok']) ? ($result['error'] ?? 'Terminate failed') : 'success';
}

/**
 * Custom button / daily cron hook — map WHMCS "Renew" to Nexlify renew.
 */
function nexlify_Renew(array $params)
{
    $days = (int) ($params['configoption4'] ?? 30);
    $result = nexlify_call($params, [
        'action' => 'renew',
        'days' => $days > 0 ? $days : 30,
    ]);
    return empty($result['ok']) ? ($result['error'] ?? 'Renew failed') : 'success';
}

function nexlify_AdminLink(array $params)
{
    $panel = rtrim($params['configoption1'] ?? '', '/');
    return $panel ? '<a href="' . htmlspecialchars($panel) . '/admin/lines" target="_blank">Open Nexlify lines</a>' : '';
}

function nexlify_ClientArea(array $params)
{
    $panel = rtrim($params['configoption1'] ?? '', '/');
    $user = htmlspecialchars($params['username'] ?? '');
    $pass = htmlspecialchars($params['password'] ?? '');
    $host = parse_url($panel, PHP_URL_HOST) ?: 'your-panel';

    return [
        'templatefile' => 'templates/clientarea',
        'vars' => [
            'panel_url' => $panel,
            'username' => $user,
            'password' => $pass,
            'm3u_url' => $panel . '/get.php?username=' . rawurlencode($params['username'] ?? '') . '&password=' . rawurlencode($params['password'] ?? '') . '&type=m3u_plus',
            'xtream_url' => $panel . '/player_api.php',
            'stalker_url' => $panel . '/stalker_portal/server/load.php',
            'host' => $host,
        ],
    ];
}
