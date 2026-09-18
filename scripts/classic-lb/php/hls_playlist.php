<?php
declare(strict_types=1);

/**
 * Auth'd m3u8 → rewrite segment URIs with HMAC so clients can fetch beyond localhost.
 * Packager output remains bound to 127.0.0.1; public path is /lb/hls/{safe}/segN.ts?e=&t=.
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    safe_stream_id,
    stream_root,
    hls_index_ready,
    hls_sign,
    hls_sign_ttl,
    heartbeat_viewer
};

$safe = safe_stream_id((string) ($_GET['safe'] ?? $_SERVER['HTTP_X_NEXLIFY_SAFE'] ?? ''));
if ($safe === '' || $safe === 'x') {
    http_response_code(400);
    exit;
}

heartbeat_viewer($safe);

$hlsDir = stream_root() . '/hls/' . $safe;
if (!hls_index_ready($hlsDir)) {
    http_response_code(503);
    header('X-Nexlify-Deny: ffmpeg_pending');
    exit;
}

$index = $hlsDir . '/index.m3u8';
$raw = @file_get_contents($index);
if ($raw === false || $raw === '') {
    http_response_code(503);
    exit;
}

$exp = time() + hls_sign_ttl();
$out = [];
foreach (preg_split("/\r\n|\n|\r/", $raw) as $line) {
    $trim = trim($line);
    if ($trim !== '' && !str_starts_with($trim, '#') && preg_match('/^(seg\d+\.ts)$/', $trim, $m)) {
        $seg = $m[1];
        $t = hls_sign($safe, $seg, $exp);
        $out[] = '/lb/hls/' . rawurlencode($safe) . '/' . $seg . '?e=' . $exp . '&t=' . $t;
    } else {
        $out[] = $line;
    }
}

header('Content-Type: application/vnd.apple.mpegurl');
header('Cache-Control: no-cache, no-store');
header('X-Nexlify-LB: classic-ffmpeg-hls-signed');
echo implode("\n", $out) . "\n";
