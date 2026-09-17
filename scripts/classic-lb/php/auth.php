<?php
declare(strict_types=1);

/**
 * nginx auth_request endpoint — validates line, starts shared FFmpeg HLS, registers connection.
 * Returns 200 + X-Nexlify-Safe for media delivery; never streams bitrate.
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    client_ip,
    panel_live_auth,
    touch_connection,
    ensure_ffmpeg,
    hls_index_ready,
    safe_stream_id,
    cfg
};

$uri = (string) ($_SERVER['HTTP_X_ORIGINAL_URI'] ?? $_SERVER['REQUEST_URI'] ?? '/');
$path = parse_url($uri, PHP_URL_PATH) ?: '/';
$parts = array_values(array_filter(explode('/', $path), static fn ($p) => $p !== ''));

$username = (string) ($_GET['username'] ?? '');
$password = (string) ($_GET['password'] ?? '');
$streamId = (string) ($_GET['stream'] ?? '');

if (count($parts) >= 4 && in_array($parts[0], ['live', 'movie', 'series', 'timeshift'], true)) {
    $username = $username !== '' ? $username : $parts[1];
    $password = $password !== '' ? $password : $parts[2];
    $rawId = $parts[3];
    $streamId = $streamId !== '' ? $streamId : (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawId);
}

if ($username === '' || $password === '' || $streamId === '') {
    http_response_code(403);
    exit;
}

$ip = client_ip();
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null;
$auth = panel_live_auth($username, $password, $streamId, $ip, $ua);
if (empty($auth['ok'])) {
    http_response_code(403);
    header('X-Nexlify-Deny: ' . (string) ($auth['deny'] ?? 'denied'));
    exit;
}

$lineId = (string) ($auth['lineId'] ?? '');
$sourceUrl = (string) ($auth['sourceUrl'] ?? '');
if ($sourceUrl === '') {
    http_response_code(503);
    header('X-Nexlify-Deny: no_source');
    exit;
}

if ($lineId !== '') {
    touch_connection($lineId, $streamId, $ip, $ua, 0);
}

$hlsDir = ensure_ffmpeg($streamId, $sourceUrl);
$deadline = microtime(true) + 10;
while (!hls_index_ready($hlsDir) && microtime(true) < $deadline) {
    usleep(100000);
}
if (!hls_index_ready($hlsDir)) {
    http_response_code(503);
    header('X-Nexlify-Deny: ffmpeg_pending');
    exit;
}

$safe = safe_stream_id($streamId);
header('X-Nexlify-Safe: ' . $safe);
header('X-Nexlify-Line-Id: ' . $lineId);
header('X-Nexlify-Stream-Id: ' . $streamId);
header('X-Nexlify-LB: classic-auth');
// Hint delivery mode for operators / debugging
$wantM3u8 = str_ends_with(strtolower($path), '.m3u8');
header('X-Nexlify-Mode: ' . ($wantM3u8 ? 'hls' : 'mpegts'));
http_response_code(200);
