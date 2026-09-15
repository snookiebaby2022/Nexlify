<?php
/**
 * WHMCS provisioning module for Nexlify Panel.
 *
 * Configure custom fields / product settings:
 *   panel_url      — https://panel.example.com
 *   billing_secret — matches panel BILLING_WEBHOOK_SECRET
 *   package_id     — Nexlify package id (optional)
 *   bouquet_ids    — comma-separated bouquet ids (optional)
 */

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

function nexlify_ConfigOptions()
{
    return [
        'panel_url' => [
            'FriendlyName' => 'Panel URL',
            'Type' => 'text',
            'Size' => '64',
            'Description' => 'Base URL without trailing slash',
        ],
        'billing_secret' => [
            'FriendlyName' => 'Billing secret',
            'Type' => 'password',
            'Size' => '64',
            'Description' => 'Same as BILLING_WEBHOOK_SECRET on the panel',
        ],
        'package_id' => [
            'FriendlyName' => 'Package ID',
            'Type' => 'text',
            'Size' => '32',
        ],
        'max_connections' => [
            'FriendlyName' => 'Max connections',
            'Type' => 'text',
            'Size' => '4',
            'Default' => '1',
        ],
    ];
}

function nexlify_apiCall(array $params, array $body)
{
    $url = rtrim($params['configoption1'], '/') . '/api/billing/provision';
    $secret = $params['configoption2'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Billing-Secret: ' . $secret,
        ],
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode($raw ?: '{}', true);
    return [$code, $json];
}

function nexlify_CreateAccount(array $params)
{
    $username = 'u' . $params['serviceid'];
    $password = bin2hex(random_bytes(6));
    [$code, $json] = nexlify_apiCall($params, [
        'operation' => 'createLine',
        'serviceId' => (string) $params['serviceid'],
        'username' => $username,
        'password' => $password,
        'days' => (int) ($params['configoptions']['days'] ?? 30),
        'maxConnections' => (int) ($params['configoption4'] ?: 1),
        'packageId' => $params['configoption3'] ?: null,
    ]);
    if ($code >= 200 && $code < 300 && !empty($json['ok'])) {
        return 'success';
    }
    return $json['error'] ?? 'Create failed';
}

function nexlify_SuspendAccount(array $params)
{
    [$code, $json] = nexlify_apiCall($params, [
        'operation' => 'suspendLine',
        'serviceId' => (string) $params['serviceid'],
    ]);
    return ($code >= 200 && $code < 300 && !empty($json['ok'])) ? 'success' : ($json['error'] ?? 'Suspend failed');
}

function nexlify_UnsuspendAccount(array $params)
{
    [$code, $json] = nexlify_apiCall($params, [
        'operation' => 'unsuspendLine',
        'serviceId' => (string) $params['serviceid'],
    ]);
    return ($code >= 200 && $code < 300 && !empty($json['ok'])) ? 'success' : ($json['error'] ?? 'Unsuspend failed');
}

function nexlify_TerminateAccount(array $params)
{
    [$code, $json] = nexlify_apiCall($params, [
        'operation' => 'terminateLine',
        'serviceId' => (string) $params['serviceid'],
    ]);
    return ($code >= 200 && $code < 300 && !empty($json['ok'])) ? 'success' : ($json['error'] ?? 'Terminate failed');
}

function nexlify_Renew(array $params)
{
    [$code, $json] = nexlify_apiCall($params, [
        'operation' => 'extendLine',
        'serviceId' => (string) $params['serviceid'],
        'days' => (int) ($params['configoptions']['days'] ?? 30),
    ]);
    return ($code >= 200 && $code < 300 && !empty($json['ok'])) ? 'success' : ($json['error'] ?? 'Renew failed');
}

function nexlify_TestConnection(array $params)
{
    $url = rtrim($params['configoption1'], '/') . '/api/billing/provision';
    $secret = $params['configoption2'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['X-Billing-Secret: ' . $secret],
        CURLOPT_TIMEOUT => 15,
    ]);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 200) {
        return ['success' => true, 'error' => ''];
    }
    return ['success' => false, 'error' => 'HTTP ' . $code . ' — ' . substr($raw ?: '', 0, 120)];
}
