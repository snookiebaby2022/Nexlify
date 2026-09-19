<?php
declare(strict_types=1);

/**
 * nginx auth_request endpoint — validates line, starts shared FFmpeg HLS (live),
 * or registers direct source for vod/timeshift. Returns 200 + X-Nexlify-Safe.
 *
 * Paths:
 *   /live|movie|series/{user}/{pass}/{id}.ext
 *   /live|movie|series/{token}/{id}.ext
 *   /play/{token}
 *   /auth/{token}
 *   /timeshift/{user}/{pass}/{dur}/{start}/{id}
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    client_ip,
    panel_live_auth,
    touch_connection,
    prune_line_connections,
    ensure_ffmpeg,
    hls_index_ready,
    packager_started,
    safe_stream_id,
    source_url_for_safe,
    remember_source,
    cfg,
    parse_play_token,
    looks_like_play_token,
    bind_viewer
};

$uri = (string) ($_SERVER['HTTP_X_ORIGINAL_URI'] ?? $_SERVER['REQUEST_URI'] ?? '/');
$path = parse_url($uri, PHP_URL_PATH) ?: '/';
$parts = array_values(array_filter(explode('/', $path), static fn ($p) => $p !== ''));

$username = (string) ($_GET['username'] ?? '');
$password = (string) ($_GET['password'] ?? '');
$streamId = (string) ($_GET['stream'] ?? '');
$kind = '';
$authOnly = false;

if (count($parts) >= 1) {
    $kind = $parts[0];
}

if ($kind === 'auth' && count($parts) >= 2) {
    $tok = parse_play_token(rawurldecode($parts[1]));
    if (!$tok) {
        http_response_code(403);
        header('X-Nexlify-Deny: bad_token');
        exit;
    }
    $username = $tok['username'];
    $password = $tok['password'];
    $streamId = $tok['streamId'] !== '' ? $tok['streamId'] : '_auth_';
    $authOnly = true;
} elseif ($kind === 'play' && count($parts) >= 2) {
    $rawTok = rawurldecode((string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $parts[1]));
    $tok = parse_play_token($rawTok);
    if (!$tok || $tok['streamId'] === '') {
        http_response_code(403);
        header('X-Nexlify-Deny: bad_play_token');
        exit;
    }
    $username = $tok['username'];
    $password = $tok['password'];
    $streamId = $tok['streamId'];
    $kind = 'live';
} elseif ($kind === 'timeshift' && count($parts) >= 6) {
    $username = $username !== '' ? $username : rawurldecode($parts[1]);
    $password = $password !== '' ? $password : rawurldecode($parts[2]);
    $rawId = rawurldecode($parts[5]);
    $streamId = $streamId !== '' ? $streamId : (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawId);
} elseif (count($parts) >= 4 && in_array($kind, ['live', 'movie', 'series'], true)) {
    $username = $username !== '' ? $username : rawurldecode($parts[1]);
    $password = $password !== '' ? $password : rawurldecode($parts[2]);
    $rawId = rawurldecode($parts[3]);
    $streamId = $streamId !== '' ? $streamId : (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawId);
} elseif (count($parts) >= 3 && in_array($kind, ['live', 'movie', 'series'], true)
    && looks_like_play_token(rawurldecode($parts[1]))) {
    $tok = parse_play_token(rawurldecode($parts[1]));
    if (!$tok) {
        http_response_code(403);
        header('X-Nexlify-Deny: bad_token');
        exit;
    }
    $username = $tok['username'];
    $password = $tok['password'];
    $rawId = rawurldecode($parts[2]);
    $streamId = $streamId !== '' ? $streamId : (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawId);
    if ($streamId === '' && $tok['streamId'] !== '') {
        $streamId = $tok['streamId'];
    }
}

if ($username === '' || $password === '') {
    http_response_code(403);
    exit;
}

// /auth/{token} without stream: HMAC already proved credentials binding — accept.
if ($authOnly && ($streamId === '' || $streamId === '_auth_')) {
    header('X-Nexlify-LB: classic-token-auth');
    header('X-Nexlify-Token: ok');
    http_response_code(200);
    exit;
}

if ($streamId === '') {
    http_response_code(403);
    exit;
}

$ip = client_ip();
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null;
// Rewrite token URIs to classic u/p form so panel live-auth parse_xtream_path can resolve
// (panel also understands tokens, but u/p is the stable cache key).
$authPath = $path;
if ($kind !== 'timeshift' && $kind !== 'auth') {
    $authPath = '/' . $kind . '/' . rawurlencode($username) . '/' . rawurlencode($password)
        . '/' . rawurlencode($streamId) . (str_ends_with(strtolower($path), '.m3u8') ? '.m3u8' : '.ts');
}
$auth = panel_live_auth($username, $password, $streamId, $ip, $ua, $authPath);
if (empty($auth['ok'])) {
    http_response_code(403);
    header('X-Nexlify-Deny: ' . (string) ($auth['deny'] ?? 'denied'));
    exit;
}

if ($authOnly) {
    header('X-Nexlify-LB: classic-token-auth');
    header('X-Nexlify-Token: ok');
    header('X-Nexlify-Line-Id: ' . (string) ($auth['lineId'] ?? ''));
    http_response_code(200);
    exit;
}

$lineId = (string) ($auth['lineId'] ?? '');
$sourceUrl = (string) ($auth['sourceUrl'] ?? '');
$connStreamId = (string) ($auth['streamId'] ?? $streamId);
$mode = (string) ($auth['mode'] ?? 'live');
if ($kind === 'movie' || $kind === 'series') {
    $mode = 'vod';
} elseif ($kind === 'timeshift') {
    $mode = 'timeshift';
}
if ($sourceUrl === '') {
    http_response_code(503);
    header('X-Nexlify-Deny: no_source');
    exit;
}

if ($lineId !== '') {
    touch_connection($lineId, $connStreamId, $ip, $ua, 0);
    // Zap reclaim — same as panel-php: max=1 drops prior channels so Live Connections
    // does not keep Sky/BBC/ITV ghosts for 10 minutes after a channel change.
    $maxConn = max(0, (int) ($auth['maxConnections'] ?? 0));
    if ($maxConn > 0) {
        prune_line_connections($lineId, $connStreamId, $ip, $maxConn);
    }
}

$wantM3u8 = str_ends_with(strtolower($path), '.m3u8');
$safe = remember_source($connStreamId, $sourceUrl, $mode);
if ($lineId !== '') {
    bind_viewer($safe, $lineId, $connStreamId, $ip, $ua);
}

// VOD / timeshift: direct remux only — do not start shared live HLS packager.
if ($mode === 'vod' || $mode === 'timeshift') {
    header('X-Nexlify-Safe: ' . $safe);
    header('X-Nexlify-Line-Id: ' . $lineId);
    header('X-Nexlify-Stream-Id: ' . $connStreamId);
    header('X-Nexlify-LB: classic-auth');
    header('X-Nexlify-Mode: ' . $mode);
    header('X-Nexlify-Hls-Ready: 0');
    http_response_code(200);
    exit;
}

// Live MPEG-TS: never block auth_request on HLS. Packager starts in background;
// mpegts.php zaps via direct remux until segments exist (warm path is instant).
// HLS playlist clients still wait for a real index.
$hlsDir = ensure_ffmpeg($connStreamId, $sourceUrl);
$ready = hls_index_ready($hlsDir);
if ($wantM3u8 && !$ready) {
    $waitMs = max(500, min(8000, (int) cfg('AUTH_READY_WAIT_MS', '4000')));
    $deadline = microtime(true) + ($waitMs / 1000.0);
    while (!hls_index_ready($hlsDir) && microtime(true) < $deadline) {
        usleep(30000);
    }
    $ready = hls_index_ready($hlsDir);
    if (!$ready) {
        http_response_code(503);
        header('X-Nexlify-Deny: ffmpeg_pending');
        exit;
    }
}
if (!$ready && !packager_started($connStreamId) && source_url_for_safe($safe) === null) {
    http_response_code(503);
    header('X-Nexlify-Deny: ffmpeg_pending');
    exit;
}

header('X-Nexlify-Safe: ' . $safe);
header('X-Nexlify-Line-Id: ' . $lineId);
header('X-Nexlify-Stream-Id: ' . $connStreamId);
header('X-Nexlify-LB: classic-auth');
header('X-Nexlify-Hls-Ready: ' . ($ready ? '1' : '0'));
header('X-Nexlify-Mode: live');
header('X-Nexlify-Format: ' . ($wantM3u8 ? 'hls' : 'mpegts'));
http_response_code(200);
