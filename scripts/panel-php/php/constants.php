<?php
declare(strict_types=1);

/** XUI constants.php — player/bootstrap constants. */
require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{json_out, cfg, request_host, request_port};

json_out([
    'server_name' => request_host(),
    'http_port' => (int) cfg('STREAM_HTTP_PORT', request_port() ?: '80'),
    'https_port' => (int) cfg('STREAM_HTTPS_PORT', '443'),
    'rtmp_port' => 0,
    'server_protocol' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http',
    'timezone' => 'UTC',
    'timestamp_now' => time(),
    'nexlify' => true,
]);
