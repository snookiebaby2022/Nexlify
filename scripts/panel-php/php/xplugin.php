<?php
declare(strict_types=1);

/**
 * XUI xplugin.php — XCIPTV / Smarters plugin probe.
 * Returns a minimal OK envelope so clients do not error.
 */
require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{json_out, cfg, request_host};

$host = request_host();
json_out([
    'status' => 'ok',
    'server' => $host,
    'version' => cfg('PANEL_VERSION', '2.0'),
    'xplugin' => true,
    'features' => [
        'live' => true,
        'vod' => true,
        'series' => true,
        'timeshift' => true,
        'epg' => true,
        'rtmp' => false,
    ],
]);
