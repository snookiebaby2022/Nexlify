<?php
declare(strict_types=1);

namespace Nexlify\ClassicLb;

function env_path(): string
{
    return getenv('NEXLIFY_LB_ENV') ?: '/etc/nexlify-lb/lb.env';
}

function load_env(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }
    // Keep connection timestamps in UTC so panel/Prisma uptime is correct.
    date_default_timezone_set('UTC');
    $path = env_path();
    $out = [];
    if (is_readable($path)) {
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (!str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $out[trim($k)] = trim($v, " \t\"'");
        }
    }
    $cache = $out;
    return $out;
}

function cfg(string $key, string $default = ''): string
{
    $e = load_env();
    return $e[$key] ?? (getenv($key) ?: $default);
}

function json_out(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function client_ip(): string
{
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if (is_string($xff) && $xff !== '') {
        $parts = explode(',', $xff);
        return trim($parts[0]);
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

function mysql_pdo(): ?\PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $host = cfg('MYSQL_HOST', '127.0.0.1');
    $port = cfg('MYSQL_PORT', '3306');
    $db = cfg('MYSQL_DATABASE', 'nexlify_lb');
    $user = cfg('MYSQL_USER', 'nexlify_lb');
    $pass = cfg('MYSQL_PASSWORD', '');
    try {
        $pdo = new \PDO(
            "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
            $user,
            $pass,
            [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
                \PDO::ATTR_PERSISTENT => cfg('MYSQL_PERSISTENT', '1') === '1',
            ]
        );
        // Match DATE_FORMAT(...Z) / panel Prisma: session must be UTC (not OS local).
        $pdo->exec("SET time_zone = '+00:00'");
    } catch (\Throwable $e) {
        $pdo = null;
    }
    return $pdo;
}

function redis_client(): ?\Redis
{
    static $r = false;
    if ($r !== false) {
        return $r;
    }
    if (!class_exists(\Redis::class)) {
        $r = null;
        return null;
    }
    $url = cfg('REDIS_URL', 'redis://127.0.0.1:6379/2');
    $parts = parse_url($url);
    if (!$parts || empty($parts['host'])) {
        $r = null;
        return null;
    }
    try {
        $redis = new \Redis();
        $redis->connect($parts['host'], (int) ($parts['port'] ?? 6379), 1.0);
        if (!empty($parts['pass'])) {
            $redis->auth($parts['pass']);
        }
        if (isset($parts['path']) && preg_match('/\/(\d+)/', $parts['path'], $m)) {
            $redis->select((int) $m[1]);
        }
        $r = $redis;
    } catch (\Throwable $e) {
        $r = null;
    }
    return $r;
}

function connection_handler(): string
{
    $h = strtolower(cfg('CONNECTION_HANDLER', 'mysql'));
    return $h === 'redis' ? 'redis' : 'mysql';
}

function touch_connection(string $lineId, string $streamId, string $ip, ?string $ua = null, int $bytes = 0): void
{
    $handler = connection_handler();
    $ttl = max(120, min(3600, (int) cfg('CONN_TTL_SECS', '600')));
    // After a long stall / buffer / reconnect, treat as a new viewer session so
    // Live Connections duration resets (XUI-style) instead of climbing forever.
    $resetGapMs = max(30_000, (int) cfg('CONN_SESSION_RESET_MS', '45000'));
    $nowMs = (int) (microtime(true) * 1000);
    if ($handler === 'redis') {
        $redis = redis_client();
        if (!$redis) {
            return;
        }
        $key = "lb:conn:{$lineId}:{$streamId}:" . ($ip !== '' ? $ip : '_');
        $prevLast = (int) ($redis->hGet($key, 'lastSeenAt') ?: 0);
        $prevStarted = (int) ($redis->hGet($key, 'startedAt') ?: 0);
        $resetSession = $prevLast <= 0 || ($nowMs - $prevLast) >= $resetGapMs;
        $started = $resetSession || $prevStarted <= 0 ? (string) $nowMs : (string) $prevStarted;
        $prevBytes = $resetSession ? 0 : (int) ($redis->hGet($key, 'bytes') ?: 0);
        $redis->hMSet($key, [
            'lineId' => $lineId,
            'streamId' => $streamId,
            'ip' => $ip,
            'userAgent' => $ua ?? '',
            'bytes' => (string) max($prevBytes, $bytes),
            'lastSeenAt' => (string) $nowMs,
            'startedAt' => $started,
        ]);
        $redis->expire($key, $ttl);
        $redis->sAdd('lb:conn:index', $key);
        return;
    }

    $pdo = mysql_pdo();
    if (!$pdo) {
        return;
    }
    // UTC only — local NOW() + DATE_FORMAT(...Z) made Live Connections duration
    // stick at 00m 00s on CEST hosts (panel parsed wall-clock as UTC → future startedAt).
    $stmt = $pdo->prepare(
        'INSERT INTO live_connections (line_id, stream_id, ip, user_agent, bytes, started_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           user_agent = COALESCE(VALUES(user_agent), user_agent),
           bytes = IF(last_seen_at < (UTC_TIMESTAMP(3) - INTERVAL ? SECOND), VALUES(bytes), GREATEST(bytes, VALUES(bytes))),
           started_at = IF(last_seen_at < (UTC_TIMESTAMP(3) - INTERVAL ? SECOND), UTC_TIMESTAMP(3), started_at),
           last_seen_at = UTC_TIMESTAMP(3)'
    );
    $gapSec = max(30, (int) round($resetGapMs / 1000));
    $stmt->execute([$lineId, $streamId, $ip, $ua, max(0, $bytes), $gapSec, $gapSec]);
}

/**
 * XUI-style zap reclaim: maxConnections=1 drops every other channel for the line;
 * higher caps keep the newest N sessions (preferring the active stream+ip).
 */
function prune_line_connections(string $lineId, string $streamId, string $ip, int $maxConn): void
{
    if ($lineId === '' || $streamId === '' || $maxConn <= 0) {
        return;
    }
    $handler = connection_handler();
    if ($handler === 'redis') {
        $redis = redis_client();
        if (!$redis) {
            return;
        }
        $keys = $redis->sMembers('lb:conn:index') ?: [];
        $prefix = "lb:conn:{$lineId}:";
        $mine = [];
        foreach ($keys as $key) {
            if (!str_starts_with((string) $key, $prefix)) {
                continue;
            }
            $h = $redis->hGetAll($key);
            if (!$h) {
                $redis->sRem('lb:conn:index', $key);
                continue;
            }
            $mine[] = [
                'key' => (string) $key,
                'streamId' => (string) ($h['streamId'] ?? ''),
                'ip' => (string) ($h['ip'] ?? ''),
                'last' => (int) ($h['lastSeenAt'] ?? 0),
            ];
        }
        if ($maxConn <= 1) {
            foreach ($mine as $row) {
                if ($row['streamId'] !== $streamId) {
                    $redis->del($row['key']);
                    $redis->sRem('lb:conn:index', $row['key']);
                }
            }
            return;
        }
        usort($mine, static function ($a, $b) use ($streamId, $ip) {
            $ap = ($a['streamId'] === $streamId && $a['ip'] === $ip) ? 0 : 1;
            $bp = ($b['streamId'] === $streamId && $b['ip'] === $ip) ? 0 : 1;
            if ($ap !== $bp) {
                return $ap <=> $bp;
            }
            return $b['last'] <=> $a['last'];
        });
        foreach (array_slice($mine, $maxConn) as $row) {
            $redis->del($row['key']);
            $redis->sRem('lb:conn:index', $row['key']);
        }
        return;
    }

    $pdo = mysql_pdo();
    if (!$pdo) {
        return;
    }
    if ($maxConn <= 1) {
        $stmt = $pdo->prepare(
            'DELETE FROM live_connections WHERE line_id = ? AND stream_id <> ?'
        );
        $stmt->execute([$lineId, $streamId]);
        return;
    }
    $stmt = $pdo->prepare(
        'DELETE FROM live_connections WHERE id IN (
           SELECT id FROM (
             SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY line_id
                 ORDER BY
                   CASE WHEN stream_id = ? AND ip = ? THEN 0 ELSE 1 END,
                   last_seen_at DESC
               ) AS rn
             FROM live_connections
             WHERE line_id = ?
           ) ranked
           WHERE rn > ?
         )'
    );
    $stmt->execute([$streamId, $ip, $lineId, $maxConn]);
}

/**
 * Bind line/stream/ip to a safe id so mpegts/hls can heartbeat without re-auth.
 * Written beside sources/{safe}.url so it survives across FPM workers.
 */
function bind_viewer(string $safe, string $lineId, string $streamId, string $ip, ?string $ua = null): void
{
    $safe = safe_stream_id($safe);
    if ($safe === '' || $safe === 'x' || $lineId === '' || $streamId === '') {
        return;
    }
    $dir = stream_root() . '/sources';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(
        $dir . '/' . $safe . '.viewer',
        (string) json_encode([
            'lineId' => $lineId,
            'streamId' => $streamId,
            'ip' => $ip,
            'ua' => $ua ?? '',
            'boundAt' => time(),
        ], JSON_UNESCAPED_SLASHES)
    );
}

/** @return array{lineId:string,streamId:string,ip:string,ua:string}|null */
function viewer_for_safe(string $safe): ?array
{
    $path = stream_root() . '/sources/' . safe_stream_id($safe) . '.viewer';
    if (!is_readable($path)) {
        return null;
    }
    $j = json_decode((string) file_get_contents($path), true);
    if (!is_array($j) || empty($j['lineId']) || empty($j['streamId'])) {
        return null;
    }
    return [
        'lineId' => (string) $j['lineId'],
        'streamId' => (string) $j['streamId'],
        'ip' => (string) ($j['ip'] ?? ''),
        'ua' => (string) ($j['ua'] ?? ''),
    ];
}

/** Refresh lastSeen while a client is actively pulling media for $safe. */
function heartbeat_viewer(string $safe, int $bytes = 0): void
{
    $v = viewer_for_safe($safe);
    if ($v === null) {
        return;
    }
    touch_connection($v['lineId'], $v['streamId'], $v['ip'], $v['ua'] !== '' ? $v['ua'] : null, $bytes);
}

function list_connections(int $staleSecs = 300): array
{
    $staleSecs = max(60, min(3600, $staleSecs));
    $handler = connection_handler();
    if ($handler === 'redis') {
        $redis = redis_client();
        if (!$redis) {
            return [];
        }
        $keys = $redis->sMembers('lb:conn:index') ?: [];
        $out = [];
        $now = (int) (microtime(true) * 1000);
        foreach ($keys as $key) {
            $h = $redis->hGetAll($key);
            if (!$h) {
                $redis->sRem('lb:conn:index', $key);
                continue;
            }
            $last = (int) ($h['lastSeenAt'] ?? 0);
            if ($last > 0 && ($now - $last) > $staleSecs * 1000) {
                $redis->del($key);
                $redis->sRem('lb:conn:index', $key);
                continue;
            }
            $out[] = [
                'lineId' => $h['lineId'] ?? '',
                'streamId' => $h['streamId'] ?? '',
                'ip' => $h['ip'] ?? '',
                'userAgent' => $h['userAgent'] ?? null,
                'bytes' => (int) ($h['bytes'] ?? 0),
                'startedAt' => isset($h['startedAt']) ? gmdate('c', (int) floor(((int) $h['startedAt']) / 1000)) : null,
                'lastSeenAt' => $last ? gmdate('c', (int) floor($last / 1000)) : null,
            ];
        }
        return $out;
    }

    $pdo = mysql_pdo();
    if (!$pdo) {
        return [];
    }
    $stmt = $pdo->prepare(
        'SELECT line_id AS lineId, stream_id AS streamId, ip, user_agent AS userAgent, bytes,
                DATE_FORMAT(started_at, "%Y-%m-%dT%H:%i:%s.%fZ") AS startedAt,
                DATE_FORMAT(last_seen_at, "%Y-%m-%dT%H:%i:%s.%fZ") AS lastSeenAt
         FROM live_connections
         WHERE last_seen_at >= (UTC_TIMESTAMP(3) - INTERVAL ? SECOND)
         ORDER BY last_seen_at DESC
         LIMIT 5000'
    );
    $stmt->execute([$staleSecs]);
    return $stmt->fetchAll() ?: [];
}

/**
 * Panel live-auth with Redis hot cache (avoids panel round-trip on zap storms).
 * @return array{ok:bool,lineId?:string,deny?:string,sourceUrl?:string}
 */
function prune_stale_connections(int $staleSecs = 600): int
{
    $staleSecs = max(60, min(3600, $staleSecs));
    $pruned = 0;
    $handler = connection_handler();
    if ($handler === 'redis') {
        $redis = redis_client();
        if (!$redis) {
            return 0;
        }
        $keys = $redis->sMembers('lb:conn:index') ?: [];
        $now = (int) (microtime(true) * 1000);
        foreach ($keys as $key) {
            $h = $redis->hGetAll($key);
            if (!$h) {
                $redis->sRem('lb:conn:index', $key);
                $pruned++;
                continue;
            }
            $last = (int) ($h['lastSeenAt'] ?? 0);
            if ($last <= 0 || ($now - $last) > ($staleSecs * 1000)) {
                $redis->del($key);
                $redis->sRem('lb:conn:index', $key);
                $pruned++;
            }
        }
        return $pruned;
    }
    $pdo = mysql_pdo();
    if (!$pdo) {
        return 0;
    }
    $stmt = $pdo->prepare(
        'DELETE FROM live_connections WHERE last_seen_at < (UTC_TIMESTAMP(3) - INTERVAL ? SECOND)'
    );
    $stmt->execute([$staleSecs]);
    return (int) $stmt->rowCount();
}

/**
 * Panel live-auth with Redis hot cache (avoids panel round-trip on zap storms).
 * @return array{ok:bool,lineId?:string,deny?:string,sourceUrl?:string,streamId?:string,mode?:string,maxConnections?:int}
 */
function panel_live_auth(
    string $username,
    string $password,
    string $streamId,
    string $ip,
    ?string $ua,
    ?string $originalPath = null
): array {
    $cacheTtl = max(5, (int) cfg('AUTH_CACHE_SECS', '90'));
    $redis = redis_client();
    // Normalize stream id (drop extension) for cache key stability across .ts/.m3u8
    $streamIdNorm = (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $streamId);
    $pathKey = $originalPath !== null && $originalPath !== '' ? $originalPath : $streamIdNorm;
    $cacheKey = 'lb:auth:' . hash('sha256', strtolower($username) . "\0" . $password . "\0" . $pathKey);
    if ($redis) {
        $cached = $redis->get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            $j = json_decode($cached, true);
            if (is_array($j) && !empty($j['ok']) && !empty($j['lineId']) && !empty($j['sourceUrl'])) {
                return [
                    'ok' => true,
                    'lineId' => (string) $j['lineId'],
                    'sourceUrl' => (string) $j['sourceUrl'],
                    'streamId' => (string) ($j['streamId'] ?? $streamIdNorm),
                    'mode' => (string) ($j['mode'] ?? 'live'),
                    'maxConnections' => max(0, (int) ($j['maxConnections'] ?? 0)),
                ];
            }
        }
    }

    $panel = rtrim(cfg('PANEL_URL'), '/');
    $token = cfg('AGENT_TOKEN');
    $internal = cfg('PANEL_INTERNAL_SECRET');
    if ($panel === '' || ($token === '' && $internal === '')) {
        return ['ok' => false, 'deny' => 'misconfigured'];
    }
    $uri = $originalPath !== null && $originalPath !== ''
        ? $originalPath
        : '/live/' . rawurlencode($username) . '/' . rawurlencode($password) . '/' . rawurlencode($streamIdNorm) . '.ts';
    if ($uri !== '' && $uri[0] !== '/') {
        $uri = '/' . $uri;
    }
    $headerList = [
        'X-Original-Uri: ' . $uri,
        'X-Original-Method: GET',
        'X-Forwarded-For: ' . $ip,
        'X-Real-Ip: ' . $ip,
        'X-Nexlify-Client-Ip: ' . $ip,
        'X-Nexlify-Viewer-Ip: ' . $ip,
        'User-Agent: ' . ($ua ?: 'Nexlify-Classic-LB'),
    ];
    $serverId = cfg('LB_SERVER_ID');
    if ($internal !== '') {
        $headerList[] = 'X-Panel-Internal-Secret: ' . $internal;
        $headerList[] = 'Authorization: Bearer ' . $internal;
    } elseif ($serverId !== '' && $token !== '') {
        $headerList[] = 'Authorization: Bearer ' . $token;
        $headerList[] = 'X-Nexlify-Agent-Server-Id: ' . $serverId;
    } else {
        $headerList[] = 'Authorization: Bearer ' . $token;
    }
    $headers = [];
    $ch = curl_init($panel . '/api/internal/live-auth');
    curl_setopt_array($ch, [
        CURLOPT_HTTPGET => true,
        CURLOPT_HTTPHEADER => $headerList,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_CONNECTTIMEOUT => 1,
        CURLOPT_TIMEOUT => 3,
        CURLOPT_HEADERFUNCTION => static function ($ch, $header) use (&$headers) {
            $len = strlen($header);
            $parts = explode(':', $header, 2);
            if (count($parts) === 2) {
                $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return $len;
        },
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 403 || $code === 401) {
        return ['ok' => false, 'deny' => 'forbidden'];
    }
    if ($code < 200 || $code >= 300) {
        return ['ok' => false, 'deny' => 'auth_http_' . $code];
    }
    $lineId = (string) ($headers['x-nexlify-line-id'] ?? '');
    $sourceUrl = (string) ($headers['x-nexlify-upstream'] ?? '');
    $resolvedStreamId = (string) ($headers['x-nexlify-stream-id'] ?? '');
    $mode = strtolower((string) ($headers['x-nexlify-mode'] ?? 'live'));
    $maxConnections = max(0, (int) ($headers['x-nexlify-max-connections'] ?? 0));
    if (!in_array($mode, ['live', 'vod', 'timeshift'], true)) {
        $mode = 'live';
    }
    if ($sourceUrl === '' || $lineId === '') {
        return ['ok' => false, 'deny' => 'missing_upstream'];
    }
    $ok = [
        'ok' => true,
        'lineId' => $lineId,
        'sourceUrl' => $sourceUrl,
        'streamId' => $resolvedStreamId !== '' ? $resolvedStreamId : $streamIdNorm,
        'mode' => $mode,
        'maxConnections' => $maxConnections,
    ];
    if ($redis) {
        $redis->setex($cacheKey, $cacheTtl, json_encode($ok));
    }
    return $ok;
}

/** Persist upstream + delivery mode for mpegts.php (vod/timeshift skip shared HLS). */
function remember_source(string $streamId, string $sourceUrl, string $mode = 'live'): string
{
    $root = stream_root();
    $safe = safe_stream_id($streamId);
    $srcDir = $root . '/sources';
    if (!is_dir($srcDir)) {
        @mkdir($srcDir, 0755, true);
    }
    @file_put_contents($srcDir . '/' . $safe . '.url', $sourceUrl);
    $mode = in_array($mode, ['live', 'vod', 'timeshift'], true) ? $mode : 'live';
    @file_put_contents($srcDir . '/' . $safe . '.mode', $mode);
    return $safe;
}

function mode_for_safe(string $safe): string
{
    $path = stream_root() . '/sources/' . safe_stream_id($safe) . '.mode';
    if (!is_file($path)) {
        return 'live';
    }
    $m = strtolower(trim((string) @file_get_contents($path)));
    return in_array($m, ['live', 'vod', 'timeshift'], true) ? $m : 'live';
}
function stream_root(): string
{
    return rtrim(cfg('STREAM_ROOT', '/var/lib/nexlify-lb'), '/');
}

function safe_stream_id(string $streamId): string
{
    $safe = preg_replace('/[^A-Za-z0-9_-]/', '', $streamId) ?: 'x';
    return $safe;
}

function ffmpeg_copy_input_args(bool $vod = false): string
{
    // Live: short probe (zap). Resilience: discard corrupt, ignore bad DTS,
    // HTTP reconnect on EOF/network/4xx-5xx so brief origin blips don't kill the pipe.
    $probe = $vod ? 1500000 : 800000;
    $analyze = $vod ? 1500000 : 800000;
    $rw = max(5_000_000, (int) cfg('FFMPEG_RW_TIMEOUT_US', $vod ? '30000000' : '20000000'));
    $reconMax = max(1, min(30, (int) cfg('FFMPEG_RECONNECT_DELAY_MAX', $vod ? '8' : '5')));
    return sprintf(
        '-fflags +genpts+igndts+discardcorrupt+nobuffer+flush_packets -flags low_delay ' .
        '-err_detect ignore_err -probesize %d -analyzeduration %d -fpsprobesize 0 -avioflags direct ' .
        '-reconnect 1 -reconnect_streamed 1 -reconnect_at_eof 1 -reconnect_on_network_error 1 ' .
        '-reconnect_on_http_error 4xx,5xx -reconnect_delay_max %d -rw_timeout %d',
        $probe,
        $analyze,
        $reconMax,
        $rw
    );
}

/** True when shared packager PID is alive but segments stopped advancing. */
function packager_stale(string $streamId, ?int $maxAgeSecs = null): bool
{
    $safe = safe_stream_id($streamId);
    if (!packager_started($safe)) {
        return false;
    }
    $maxAge = $maxAgeSecs ?? max(8, min(60, (int) cfg('FFMPEG_STALE_SECS', '12')));
    $hlsDir = stream_root() . '/hls/' . $safe;
    $newest = 0;
    foreach (glob($hlsDir . '/seg*.ts') ?: [] as $seg) {
        $mt = @filemtime($seg);
        if ($mt !== false && $mt > $newest) {
            $newest = $mt;
        }
    }
    $index = $hlsDir . '/index.m3u8';
    if (is_file($index)) {
        $imt = @filemtime($index);
        if ($imt !== false && $imt > $newest) {
            $newest = $imt;
        }
    }
    if ($newest <= 0) {
        // Process up but never produced media — stale after short grace.
        $pidFile = stream_root() . '/pids/' . $safe . '.pid';
        $started = is_file($pidFile) ? (int) @filemtime($pidFile) : 0;
        return $started > 0 && (time() - $started) > max(6, (int) ($maxAge / 2));
    }
    return (time() - $newest) > $maxAge;
}

function kill_packager(string $streamId): void
{
    $safe = safe_stream_id($streamId);
    $pidFile = stream_root() . '/pids/' . $safe . '.pid';
    if (!is_file($pidFile)) {
        return;
    }
    $pid = (int) trim((string) file_get_contents($pidFile));
    if ($pid > 1) {
        if (function_exists('posix_kill')) {
            @posix_kill($pid, 15);
            usleep(120000);
            if (@posix_kill($pid, 0)) {
                @posix_kill($pid, 9);
            }
        } else {
            @exec('kill -15 ' . $pid . ' 2>/dev/null');
            usleep(120000);
            @exec('kill -9 ' . $pid . ' 2>/dev/null');
        }
    }
    @unlink($pidFile);
}

/** One FFmpeg HLS packager per channel (multi-viewer safe). Returns HLS dir. */
function ensure_ffmpeg(string $streamId, string $sourceUrl): string
{
    $root = stream_root();
    $safe = safe_stream_id($streamId);
    $hlsDir = $root . '/hls/' . $safe;
    $pidDir = $root . '/pids';
    $logDir = $root . '/logs';
    $viewDir = $root . '/viewers';
    $srcDir = $root . '/sources';
    foreach ([$hlsDir, $pidDir, $logDir, $viewDir, $srcDir] as $d) {
        if (!is_dir($d)) {
            mkdir($d, 0755, true);
        }
    }
    $pidFile = $pidDir . '/' . $safe . '.pid';
    $logFile = $logDir . '/' . $safe . '.log';
    $indexPath = $hlsDir . '/index.m3u8';
    $srcFile = $srcDir . '/' . $safe . '.url';
    $lockFile = $pidDir . '/' . $safe . '.lock';
    $ffmpeg = cfg('FFMPEG_BIN', '/usr/local/bin/ffmpeg');

    $lockFh = @fopen($lockFile, 'c');
    if ($lockFh) {
        flock($lockFh, LOCK_EX);
    }

    $running = packager_started($safe);
    // Source URL change or stuck packager (alive but no fresh segments) → restart.
    $prevUrl = is_readable($srcFile) ? trim((string) @file_get_contents($srcFile)) : '';
    if ($running && (($prevUrl !== '' && $prevUrl !== $sourceUrl) || packager_stale($safe))) {
        kill_packager($safe);
        $running = false;
    }
    // Persist upstream for cold-start direct MPEG-TS remux (instant zap before HLS ready).
    @file_put_contents($srcFile, $sourceUrl);

    if (!$running) {
        if (!is_dir($hlsDir)) {
            mkdir($hlsDir, 0755, true);
        }
        // Drop stale segments so we never remux a dead window as "ready".
        foreach (glob($hlsDir . '/seg*.ts') ?: [] as $old) {
            @unlink($old);
        }
        @unlink($indexPath);
        $segPattern = $hlsDir . '/seg%d.ts';
        // Instant zap: short segments. break_non_keyframes so GOP~10s sources still
        // split near HLS_TIME — otherwise mpegts passthrough stalls at the live edge.
        $hlsTime = max(1, min(4, (int) cfg('HLS_TIME', '1')));
        $hlsList = max(4, min(24, (int) cfg('HLS_LIST_SIZE', '10')));
        $initTime = max(0.4, min(2.0, (float) $hlsTime * 0.5));
        $cmd = sprintf(
            'nohup %s -hide_banner -loglevel warning ' .
            '%s ' .
            '-i %s -map 0:v:0? -map 0:a:0? -c copy ' .
            '-muxdelay 0 -muxpreload 0 -flush_packets 1 -max_delay 500000 ' .
            '-avoid_negative_ts make_zero ' .
            '-f hls -hls_time %d -hls_init_time %.1f -hls_list_size %d ' .
            '-hls_flags delete_segments+append_list+omit_endlist+program_date_time+split_by_time ' .
            '-break_non_keyframes 1 ' .
            '-hls_segment_filename %s %s > %s 2>&1 & echo $! > %s',
            escapeshellarg($ffmpeg),
            ffmpeg_copy_input_args(false),
            escapeshellarg($sourceUrl),
            $hlsTime,
            $initTime,
            $hlsList,
            escapeshellarg($segPattern),
            escapeshellarg($indexPath),
            escapeshellarg($logFile),
            escapeshellarg($pidFile)
        );
        exec($cmd);
    }
    if ($lockFh) {
        flock($lockFh, LOCK_UN);
        fclose($lockFh);
    }
    @file_put_contents($viewDir . '/' . $safe, (string) time());

    $pdo = mysql_pdo();
    if ($pdo) {
        $st = $pdo->prepare(
            'INSERT INTO stream_sources (stream_id, source_url) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE source_url = VALUES(source_url)'
        );
        $st->execute([$streamId, $sourceUrl]);
    }
    return $hlsDir;
}

function source_url_for_safe(string $safe): ?string
{
    $path = stream_root() . '/sources/' . safe_stream_id($safe) . '.url';
    if (!is_readable($path)) {
        return null;
    }
    $url = trim((string) file_get_contents($path));
    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        return null;
    }
    return $url;
}

function hls_index_ready(string $hlsDir): bool
{
    $index = $hlsDir . '/index.m3u8';
    if (!is_file($index) || filesize($index) < 24) {
        return false;
    }
    // Need a fresh segment (written in the last 15s) with a few TS packets.
    $now = time();
    $segs = glob($hlsDir . '/seg*.ts') ?: [];
    foreach ($segs as $seg) {
        if (!is_file($seg) || filesize($seg) < 940) {
            continue;
        }
        $mtime = (int) filemtime($seg);
        if (($now - $mtime) <= 15) {
            return true;
        }
    }
    return false;
}

function packager_started(string $streamId): bool
{
    $safe = safe_stream_id($streamId);
    $pidFile = stream_root() . '/pids/' . $safe . '.pid';
    if (!is_file($pidFile)) {
        return false;
    }
    $pid = (int) trim((string) file_get_contents($pidFile));
    if ($pid < 2) {
        return false;
    }
    if (function_exists('posix_kill')) {
        return @posix_kill($pid, 0);
    }
    return is_dir('/proc/' . $pid);
}

/** HMAC secret for public HLS segment URLs (packager stays localhost-only). */
function hls_sign_secret(): string
{
    $s = cfg('HLS_SIGN_SECRET', '');
    if ($s !== '') {
        return $s;
    }
    $s = cfg('AGENT_TOKEN', '');
    return $s !== '' ? $s : 'nexlify-hls-dev';
}

function hls_sign(string $safe, string $seg, int $exp): string
{
    return hash_hmac('sha256', safe_stream_id($safe) . '|' . $seg . '|' . $exp, hls_sign_secret());
}

function hls_sign_ok(string $safe, string $seg, string $token, int $exp): bool
{
    if ($exp < time() - 30) {
        return false;
    }
    if ($exp > time() + 86400) {
        return false;
    }
    $seg = basename($seg);
    if (!preg_match('/^seg\d+\.ts$/', $seg)) {
        return false;
    }
    return hash_equals(hls_sign($safe, $seg, $exp), $token);
}

/** TTL for signed segment links (seconds). */
function hls_sign_ttl(): int
{
    return max(60, min(7200, (int) cfg('HLS_SIGN_TTL', '900')));
}

/** HMAC secret for XUI-style /live|{token}/… and /play/{token} URLs. */
function play_token_secret(): string
{
    $s = cfg('PLAY_TOKEN_SECRET', '');
    if ($s !== '') {
        return $s;
    }
    $s = cfg('PANEL_INTERNAL_SECRET', '');
    if ($s !== '') {
        return $s;
    }
    $s = cfg('AGENT_TOKEN', '');
    return $s !== '' ? $s : 'nexlify-play-dev';
}

function play_token_b64e(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function play_token_b64d(string $s): string|false
{
    $pad = strlen($s) % 4;
    if ($pad > 0) {
        $s .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($s, '-_', '+/'), true);
}

/**
 * Mint opaque play token. Payload: u, p, optional s (stream), e (exp unix).
 * Format: base64url(json).base64url(hmac-sha256 raw).
 */
function mint_play_token(string $username, string $password, ?string $streamId = null, int $ttl = 86400): string
{
    $payload = [
        'u' => $username,
        'p' => $password,
        'e' => time() + max(60, $ttl),
    ];
    if ($streamId !== null && $streamId !== '') {
        $payload['s'] = $streamId;
    }
    $body = play_token_b64e((string) json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig = play_token_b64e(hash_hmac('sha256', $body, play_token_secret(), true));
    return $body . '.' . $sig;
}

/** @return array{username:string,password:string,streamId:string}|null */
function parse_play_token(string $token): ?array
{
    $token = trim($token);
    if ($token === '' || !str_contains($token, '.')) {
        return null;
    }
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
        return null;
    }
    [$body, $sig] = $parts;
    $expect = play_token_b64e(hash_hmac('sha256', $body, play_token_secret(), true));
    if (!hash_equals($expect, $sig)) {
        return null;
    }
    $raw = play_token_b64d($body);
    if ($raw === false) {
        return null;
    }
    $j = json_decode($raw, true);
    if (!is_array($j) || empty($j['u']) || empty($j['p'])) {
        return null;
    }
    if (isset($j['e']) && (int) $j['e'] < time() - 30) {
        return null;
    }
    return [
        'username' => (string) $j['u'],
        'password' => (string) $j['p'],
        'streamId' => isset($j['s']) ? (string) $j['s'] : '',
    ];
}

function looks_like_play_token(string $s): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/', $s);
}
