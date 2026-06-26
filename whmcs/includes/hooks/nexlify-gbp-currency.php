<?php
/**
 * Force GBP on storefront/cart — prevents blank prices when session still references removed USD.
 */
if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

use WHMCS\Database\Capsule;

function nexlify_default_currency_id(): int
{
    static $id = null;
    if ($id !== null) {
        return $id;
    }
    $row = Capsule::table('tblcurrencies')->where('default', 1)->first(['id']);
    $id = $row ? (int) $row->id : 2;
    return $id;
}

function nexlify_force_gbp_session(): void
{
    $defaultId = nexlify_default_currency_id();
    if ($defaultId <= 0) {
        return;
    }
    $current = isset($_SESSION['currency']) ? (int) $_SESSION['currency'] : 0;
    $exists = $current > 0 && Capsule::table('tblcurrencies')->where('id', $current)->exists();
    if (!$exists || $current !== $defaultId) {
        $_SESSION['currency'] = $defaultId;
    }
}

add_hook('ShoppingCartLoad', 1, function () {
    nexlify_force_gbp_session();
});

add_hook('ClientAreaPageCart', 1, function () {
    nexlify_force_gbp_session();
    return [];
});

add_hook('ClientAreaPage', 1, function () {
    $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if (in_array($script, ['cart.php', 'index.php'], true)) {
        nexlify_force_gbp_session();
    }
    return [];
});
