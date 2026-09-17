<?php
declare(strict_types=1);

/**
 * Fallback stream handler — prefer nginx auth_request + mpegts.php remux.
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    client_ip,
    panel_live_auth,
    touch_connection,
    ensure_ffmpeg,
    hls_index_ready,
    safe_stream_id
};

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$parts = array_values(array_filter(explode('/', $path), static fn ($p) => $p !== ''));

$username = (string) ($_GET['username'] ?? $_GET['user'] ?? '');
$password = (string) ($_GET['password'] ?? $_GET['pass'] ?? '');
$streamId = (string) ($_GET['stream'] ?? $_GET['streamId'] ?? '');
$wantM3u8 = str_ends_with(strtolower($path), '.m3u8');

if (count($parts) >= 4 && in_array($parts[0], ['live', 'movie', 'series', 'timeshift'], true)) {
    $username = $username !== '' ? $username : $parts[1];
    $password = $password !== '' ? $password : $parts[2];
    $rawId = $parts[3];
    if (str_ends_with(strtolower($rawId), '.m3u8')) {
        $wantM3u8 = true;
    }
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
    exit;
}

$sourceUrl = (string) ($auth['sourceUrl'] ?? '');
$lineId = (string) ($auth['lineId'] ?? '');
if ($sourceUrl === '') {
    http_response_code(503);
    exit;
}
if ($lineId !== '') {
    touch_connection($lineId, $streamId, $ip, $ua, 0);
}

$hlsDir = ensure_ffmpeg($streamId, $sourceUrl);
$deadline = microtime(true) + 8;
while (!hls_index_ready($hlsDir) && microtime(true) < $deadline) {
    usleep(150000);
}
if (!hls_index_ready($hlsDir)) {
    http_response_code(503);
    exit;
}

$safe = safe_stream_id($streamId);
if ($wantM3u8) {
    header('X-Accel-Redirect: /lb/hls-static/' . $safe . '/index.m3u8');
    header('Content-Type: application/vnd.apple.mpegurl');
    exit;
}

$_GET['safe'] = $safe;
require __DIR__ . '/mpegts.php';
