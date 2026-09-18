<?php
declare(strict_types=1);

/**
 * Serve one HLS segment after HMAC check — no panel live-auth round-trip.
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    safe_stream_id,
    stream_root,
    hls_sign_ok,
    heartbeat_viewer
};

$safe = safe_stream_id((string) ($_GET['safe'] ?? ''));
$seg = basename((string) ($_GET['seg'] ?? ''));
$exp = (int) ($_GET['e'] ?? 0);
$token = (string) ($_GET['t'] ?? '');

if ($safe === '' || $safe === 'x' || $seg === '' || !hls_sign_ok($safe, $seg, $token, $exp)) {
    http_response_code(403);
    header('X-Nexlify-Deny: bad_hls_token');
    exit;
}

heartbeat_viewer($safe);

$path = stream_root() . '/hls/' . $safe . '/' . $seg;
if (!is_file($path) || filesize($path) < 188) {
    http_response_code(404);
    exit;
}

$size = (int) filesize($path);
header('Content-Type: video/mp2t');
header('Cache-Control: private, max-age=10');
header('Content-Length: ' . $size);
header('X-Nexlify-LB: classic-ffmpeg-hls-seg');
readfile($path);
