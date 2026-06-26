<?php
/**
 * StreamForge / StreamBilling — WHMCS Server Module
 *
 * Automates IPTV panel license keys on create, renew, suspend, unsuspend, terminate.
 *
 * Install: copy this folder to /modules/servers/streambilling/
 * WHMCS Admin → System Settings → Products/Services → Module Settings
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

function streambilling_MetaData()
{
    return [
        'DisplayName' => 'StreamForge Panel License',
        'APIVersion' => '1.1',
        'RequiresServer' => true,
        'DefaultNonSSLPort' => '80',
        'DefaultSSLPort' => '443',
    ];
}

/**
 * Build API base URL from WHMCS server fields (hostname only — no https://).
 */
function streambilling_apiBaseUrl(array $params): string
{
    $host = trim($params['serverhostname'] ?? $params['serverip'] ?? '');
    $host = preg_replace('#^https?://#i', '', $host);
    $host = rtrim($host, '/');
    if ($host === '') {
        return '';
    }

    $secure = !empty($params['serversecure']);
    $port = trim((string) ($params['serverport'] ?? ''));
    if ($port === '' || $port === '0') {
        $port = $secure ? '443' : '80';
    }

    $scheme = $secure ? 'https' : 'http';
    if (($scheme === 'https' && $port === '443') || ($scheme === 'http' && $port === '80')) {
        return $scheme . '://' . $host;
    }

    return $scheme . '://' . $host . ':' . $port;
}

function streambilling_TestConnection(array $params)
{
    $apiUrl = streambilling_apiBaseUrl($params);
    if ($apiUrl === '' || empty($params['serverpassword'])) {
        return [
            'success' => false,
            'error' => 'Enter Hostname nexlify.live (no https://), enable SSL, Port 443, and Password = WHMCS_API_SECRET',
        ];
    }
    $health = @file_get_contents($apiUrl . '/api/health');
    if ($health === false) {
        return ['success' => false, 'error' => 'Cannot reach ' . $apiUrl];
    }
    $probe = streambilling_apiRequest($params, [
        'action' => 'suspend',
        'serviceId' => '__whmcs_connection_test__',
    ]);
    if (($probe['error'] ?? '') === 'Unauthorized') {
        return ['success' => false, 'error' => 'API secret rejected — Password must match WHMCS_API_SECRET on nexlify.live'];
    }
    return ['success' => true, 'error' => ''];
}

function streambilling_ConfigOptions()
{
    return [];
}

function streambilling_apiRequest(array $params, array $payload)
{
    $apiUrl = streambilling_apiBaseUrl($params);
    $apiKey = $params['serverpassword'] ?? '';

    if (empty($apiUrl) || empty($apiKey)) {
        return ['success' => false, 'error' => 'API URL or secret not configured in module server settings'];
    }

    $endpoint = $apiUrl . '/api/whmcs';
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-whmcs-api-key: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false) {
        return ['success' => false, 'error' => 'Failed to connect to license API'];
    }

    $data = json_decode($response, true);
    if (!is_array($data)) {
        return ['success' => false, 'error' => 'Invalid API response'];
    }
    if ($httpCode >= 400) {
        return ['success' => false, 'error' => $data['error'] ?? 'API error'];
    }

    return $data;
}

function streambilling_CreateAccount(array $params)
{
    $productId = (int) $params['pid'];
    $result = streambilling_apiRequest($params, [
        'action' => 'create',
        'serviceId' => (string) $params['serviceid'],
        'productId' => $productId,
        'email' => $params['clientsdetails']['email'],
        'clientName' => trim(($params['clientsdetails']['firstname'] ?? '') . ' ' . ($params['clientsdetails']['lastname'] ?? '')),
        'billingCycle' => $params['model']['billingcycle'] ?? 'monthly',
    ]);

    if (empty($result['success'])) {
        return $result['error'] ?? 'License provisioning failed';
    }

    if (($result['type'] ?? '') === 'addon') {
        $service = $result['service'] ?? 'plugin';
        $productName = $result['productName'] ?? $service;
        $bundleServices = $result['bundleServices'] ?? null;
        $notes = $bundleServices
            ? 'Panel bundle: ' . $productName . ' (' . implode(', ', $bundleServices) . ')'
            : 'Panel addon: ' . $productName . ' (' . $service . ')';
        localAPI('UpdateClientProduct', [
            'serviceid' => $params['serviceid'],
            'notes' => $notes,
        ]);
        return 'success';
    }

    $key = $result['licenseKey'] ?? '';
    if ($key !== '') {
        localAPI('UpdateClientProduct', [
            'serviceid' => $params['serviceid'],
            'notes' => 'Panel license: ' . $key,
        ]);
    }

    return 'success';
}

function streambilling_SuspendAccount(array $params)
{
    $result = streambilling_apiRequest($params, [
        'action' => 'suspend',
        'serviceId' => (string) $params['serviceid'],
    ]);
    return empty($result['success']) ? ($result['error'] ?? 'Suspend failed') : 'success';
}

function streambilling_UnsuspendAccount(array $params)
{
    $result = streambilling_apiRequest($params, [
        'action' => 'unsuspend',
        'serviceId' => (string) $params['serviceid'],
    ]);
    return empty($result['success']) ? ($result['error'] ?? 'Unsuspend failed') : 'success';
}

function streambilling_TerminateAccount(array $params)
{
    $result = streambilling_apiRequest($params, [
        'action' => 'terminate',
        'serviceId' => (string) $params['serviceid'],
    ]);
    return empty($result['success']) ? ($result['error'] ?? 'Terminate failed') : 'success';
}

function streambilling_Renew(array $params)
{
    $productId = (int) $params['pid'];
    $result = streambilling_apiRequest($params, [
        'action' => 'renew',
        'serviceId' => (string) $params['serviceid'],
        'productId' => $productId,
        'email' => $params['clientsdetails']['email'],
        'billingCycle' => $params['model']['billingcycle'] ?? 'monthly',
    ]);
    return empty($result['success']) ? ($result['error'] ?? 'Renew failed') : 'success';
}

function streambilling_AdminServicesTabFields(array $params)
{
    $result = streambilling_apiRequest($params, [
        'action' => 'unsuspend',
        'serviceId' => (string) $params['serviceid'],
    ]);
    // Fetch license via custom field or stored note — WHMCS stores in service custom fields
    return [];
}

function streambilling_ClientArea(array $params)
{
    return [
        'templatefile' => 'clientarea',
        'vars' => [
            'serviceId' => $params['serviceid'],
        ],
    ];
}
