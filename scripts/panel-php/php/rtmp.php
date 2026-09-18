<?php
declare(strict_types=1);

/**
 * XUI stream/rtmp.php stand-in at /rtmp.php and /streaming/rtmp.php.
 * Full nginx-rtmp publish plane is not enabled; acknowledge control callbacks
 * so misconfigured clients get a clean response instead of 404.
 */
require __DIR__ . '/lib.php';

$call = strtolower((string) ($_GET['call'] ?? $_POST['call'] ?? ''));
$addr = (string) ($_GET['addr'] ?? $_SERVER['REMOTE_ADDR'] ?? '');

// nginx-rtmp on_publish often hits with call=publish from 127.0.0.1
if ($call === 'publish' && ($addr === '127.0.0.1' || $addr === '::1')) {
    http_response_code(200);
    header('X-Nexlify: rtmp-ack');
    exit;
}
if ($call === 'play_done' || $call === 'publish_done') {
    http_response_code(200);
    exit;
}

http_response_code(501);
header('Content-Type: application/json; charset=utf-8');
header('X-Nexlify: rtmp-disabled');
echo json_encode([
    'ok' => false,
    'error' => 'RTMP data plane not enabled on Nexlify classic-lb (use MPEG-TS/HLS)',
    'rtmp' => false,
], JSON_UNESCAPED_SLASHES);
