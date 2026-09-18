<?php
declare(strict_types=1);

/**
 * Internal live-auth for classic-lb (XUI-style).
 * 200 + X-Nexlify-Upstream / Line-Id / Stream-Id — never streams bitrate.
 * Supports live, movie, series, and XC timeshift paths.
 */
require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{
    authorize_internal_request,
    client_ip,
    find_line_by_username,
    get_stream,
    is_safe_upstream,
    line_has_connection_capacity,
    line_has_stream,
    line_is_playable,
    parse_xtream_path,
    resolve_stream_id,
    track_connection,
    xtream_timeshift_source_url,
    cache_get,
    cache_set,
    cfg
};

if (!authorize_internal_request()) {
    http_response_code(403);
    exit;
}

$uri = (string) ($_SERVER['HTTP_X_ORIGINAL_URI'] ?? $_GET['uri'] ?? $_SERVER['REQUEST_URI'] ?? '/');
if (str_starts_with($uri, 'http://') || str_starts_with($uri, 'https://')) {
    $uri = (string) (parse_url($uri, PHP_URL_PATH) ?: '/');
}
$uri = explode('?', $uri, 2)[0];

$parsed = parse_xtream_path($uri);
if (!$parsed) {
    http_response_code(204);
    header('X-Nexlify-Passthrough: 1');
    exit;
}

$username = (string) $parsed['username'];
$password = (string) $parsed['password'];
$rawKey = (string) $parsed['streamKey'];
$kind = (string) $parsed['kind'];
$ip = client_ip();
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null;

$line = find_line_by_username($username);
if (!$line || (string) $line['password'] !== $password || !line_is_playable($line)) {
    http_response_code(401);
    exit;
}

// Token auth probe without stream — credentials only
if ($kind === 'auth' && ($rawKey === '' || $rawKey === '_auth_')) {
    http_response_code(200);
    header('X-Nexlify-Line-Id: ' . (string) $line['id']);
    header('X-Nexlify-Token: ok');
    exit;
}

$streamId = resolve_stream_id($rawKey, $username);
if (!$streamId) {
    http_response_code(404);
    exit;
}

if (!line_has_stream((string) $line['id'], $streamId)) {
    http_response_code(403);
    exit;
}

$stream = get_stream($streamId);
$active = $stream['isActive'] ?? false;
$isActive = $active === true || $active === 't' || $active === '1' || $active === 1;
if (!$stream || !$isActive) {
    http_response_code(404);
    exit;
}

$maxConn = max(0, (int) ($line['maxConnections'] ?? 1));
if (!line_has_connection_capacity((string) $line['id'], $streamId, $ip, $maxConn)) {
    http_response_code(403);
    header('X-Nexlify-Deny: connections');
    header('X-Nexlify-Max-Connections: ' . $maxConn);
    exit;
}

$mode = 'live';
if ($kind === 'timeshift' || !empty($parsed['isTimeshift'])) {
    $mode = 'timeshift';
} elseif ($kind === 'movie' || $kind === 'series' || !empty($parsed['spliceVod'])) {
    $mode = 'vod';
}

$wantsHls = !empty($parsed['wantsHls']);
$durationMin = (int) ($parsed['durationMin'] ?? 0);
$start = (string) ($parsed['start'] ?? '');
$cacheKey = 'panelphp:liveauth:' . hash(
    'sha256',
    $line['id'] . '|' . $streamId . '|' . $mode . '|' . $durationMin . '|' . $start . '|' . ($wantsHls ? 'hls' : 'ts')
);
$cached = cache_get($cacheKey);
if (is_string($cached) && $cached !== '') {
    $j = json_decode($cached, true);
    if (is_array($j) && !empty($j['upstream']) && is_safe_upstream($j['upstream'])) {
        track_connection((string) $line['id'], $streamId, $ip, $ua, $maxConn);
        http_response_code(200);
        header('X-Nexlify-Line-Id: ' . $line['id']);
        header('X-Nexlify-Stream-Id: ' . $streamId);
        header('X-Nexlify-Upstream: ' . $j['upstream']);
        if (!empty($j['backup']) && is_safe_upstream((string) $j['backup'])) {
            header('X-Nexlify-Alts: ' . rawurlencode((string) $j['backup']));
        }
        header('X-Nexlify-Live: ' . ($mode === 'live' ? '1' : '0'));
        header('X-Nexlify-Mode: ' . $mode);
        header('X-Nexlify-Max-Connections: ' . $maxConn);
        if ($wantsHls) {
            header('X-Nexlify-Hls: 1');
        }
        header('Cache-Control: no-store');
        exit;
    }
}

$upstream = trim((string) ($stream['streamUrl'] ?? ''));
$backup = trim((string) ($stream['backupUrl'] ?? ''));
if (!is_safe_upstream($upstream) && is_safe_upstream($backup)) {
    $upstream = $backup;
    $backup = '';
}
if (!is_safe_upstream($upstream)) {
    http_response_code(204);
    header('X-Nexlify-Passthrough: 1');
    exit;
}

if ($mode === 'timeshift') {
    $tsUrl = xtream_timeshift_source_url($upstream, $durationMin, $start);
    if ($tsUrl === null || !is_safe_upstream($tsUrl)) {
        http_response_code(503);
        header('X-Nexlify-Deny: timeshift_url');
        exit;
    }
    $upstream = $tsUrl;
    $backup = '';
}

$ttl = max(5, (int) cfg('AUTH_CACHE_SECS', '25'));
cache_set(
    $cacheKey,
    json_encode(['upstream' => $upstream, 'backup' => $backup], JSON_UNESCAPED_SLASHES),
    $ttl
);
track_connection((string) $line['id'], $streamId, $ip, $ua, $maxConn);

http_response_code(200);
header('X-Nexlify-Line-Id: ' . $line['id']);
header('X-Nexlify-Stream-Id: ' . $streamId);
header('X-Nexlify-Upstream: ' . $upstream);
if (is_safe_upstream($backup)) {
    header('X-Nexlify-Alts: ' . rawurlencode($backup));
}
header('X-Nexlify-Live: ' . ($mode === 'live' ? '1' : '0'));
header('X-Nexlify-Mode: ' . $mode);
header('X-Nexlify-Max-Connections: ' . $maxConn);
if ($wantsHls) {
    header('X-Nexlify-Hls: 1');
}
header('Cache-Control: no-store');
exit;
