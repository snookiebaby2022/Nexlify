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
    if ($handler === 'redis') {
        $redis = redis_client();
        if (!$redis) {
            return;
        }
        $key = "lb:conn:{$lineId}:{$streamId}:" . ($ip !== '' ? $ip : '_');
        $started = $redis->hGet($key, 'startedAt') ?: (string) (int) (microtime(true) * 1000);
        $redis->hMSet($key, [
            'lineId' => $lineId,
            'streamId' => $streamId,
            'ip' => $ip,
            'userAgent' => $ua ?? '',
            'bytes' => (string) $bytes,
            'lastSeenAt' => (string) (int) (microtime(true) * 1000),
            'startedAt' => $started,
        ]);
        $redis->expire($key, 120);
        $redis->sAdd('lb:conn:index', $key);
        return;
    }

    $pdo = mysql_pdo();
    if (!$pdo) {
        return;
    }
    $stmt = $pdo->prepare(
        'INSERT INTO live_connections (line_id, stream_id, ip, user_agent, bytes, started_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE last_seen_at = NOW(3), user_agent = COALESCE(VALUES(user_agent), user_agent),
           bytes = GREATEST(bytes, VALUES(bytes))'
    );
    $stmt->execute([$lineId, $streamId, $ip, $ua, max(0, $bytes)]);
}

function list_connections(int $staleSecs = 90): array
{
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
                'startedAt' => isset($h['startedAt']) ? date('c', (int) floor(((int) $h['startedAt']) / 1000)) : null,
                'lastSeenAt' => $last ? date('c', (int) floor($last / 1000)) : null,
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
         WHERE last_seen_at >= (NOW(3) - INTERVAL ? SECOND)
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
function panel_live_auth(string $username, string $password, string $streamId, string $ip, ?string $ua): array
{
    $cacheTtl = max(5, (int) cfg('AUTH_CACHE_SECS', '25'));
    $redis = redis_client();
    $cacheKey = 'lb:auth:' . hash('sha256', strtolower($username) . "\0" . $password . "\0" . $streamId);
    if ($redis) {
        $cached = $redis->get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            $j = json_decode($cached, true);
            if (is_array($j) && !empty($j['ok']) && !empty($j['lineId']) && !empty($j['sourceUrl'])) {
                return [
                    'ok' => true,
                    'lineId' => (string) $j['lineId'],
                    'sourceUrl' => (string) $j['sourceUrl'],
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
    $uri = '/live/' . rawurlencode($username) . '/' . rawurlencode($password) . '/' . rawurlencode($streamId) . '.ts';
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
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 4,
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
    if ($sourceUrl === '' || $lineId === '') {
        return ['ok' => false, 'deny' => 'missing_upstream'];
    }
    $ok = [
        'ok' => true,
        'lineId' => $lineId,
        'sourceUrl' => $sourceUrl,
    ];
    if ($redis) {
        $redis->setex($cacheKey, $cacheTtl, json_encode($ok));
    }
    return $ok;
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

/** One FFmpeg HLS packager per channel (multi-viewer safe). Returns HLS dir. */
function ensure_ffmpeg(string $streamId, string $sourceUrl): string
{
    $root = stream_root();
    $safe = safe_stream_id($streamId);
    $hlsDir = $root . '/hls/' . $safe;
    $pidDir = $root . '/pids';
    $logDir = $root . '/logs';
    $viewDir = $root . '/viewers';
    foreach ([$hlsDir, $pidDir, $logDir, $viewDir] as $d) {
        if (!is_dir($d)) {
            mkdir($d, 0755, true);
        }
    }
    $pidFile = $pidDir . '/' . $safe . '.pid';
    $logFile = $logDir . '/' . $safe . '.log';
    $indexPath = $hlsDir . '/index.m3u8';
    $ffmpeg = cfg('FFMPEG_BIN', '/usr/local/bin/ffmpeg');

    $running = false;
    if (is_file($pidFile)) {
        $pid = (int) trim((string) file_get_contents($pidFile));
        if ($pid > 1) {
            if (function_exists('posix_kill')) {
                $running = @posix_kill($pid, 0);
            } else {
                $running = is_dir('/proc/' . $pid);
            }
        }
    }
    if (!$running) {
        $segPattern = $hlsDir . '/seg%d.ts';
        $cmd = sprintf(
            'nohup %s -hide_banner -loglevel warning -fflags +genpts+nobuffer+discardcorrupt -flags low_delay ' .
            '-reconnect 1 -reconnect_streamed 1 -reconnect_at_eof 1 -reconnect_delay_max 2 -rw_timeout 20000000 ' .
            '-i %s -map 0:v:0? -map 0:a:0? -c copy -f hls -hls_time 2 -hls_list_size 6 ' .
            '-hls_flags delete_segments+append_list+omit_endlist -hls_segment_filename %s %s > %s 2>&1 & echo $! > %s',
            escapeshellarg($ffmpeg),
            escapeshellarg($sourceUrl),
            escapeshellarg($segPattern),
            escapeshellarg($indexPath),
            escapeshellarg($logFile),
            escapeshellarg($pidFile)
        );
        exec($cmd);
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

function hls_index_ready(string $hlsDir): bool
{
    $index = $hlsDir . '/index.m3u8';
    return is_file($index) && filesize($index) > 16;
}
