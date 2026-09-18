<?php
declare(strict_types=1);

namespace Nexlify\PanelPhp;

function env_path(): string
{
    return getenv('NEXLIFY_PANEL_ENV') ?: '/etc/nexlify-panel/panel.env';
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
    // Fallback: panel Next .env if present on co-located host
    $nextEnv = '/opt/nexlify-panel/.env';
    if (is_readable($nextEnv)) {
        foreach (file($nextEnv, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v, " \t\"'");
            if (!isset($out[$k]) || $out[$k] === '' || str_starts_with($out[$k], 'CHANGE_ME')) {
                $out[$k] = $v;
            }
        }
    }
    $cache = $out;
    return $cache;
}

function cfg(string $key, string $default = ''): string
{
    $e = load_env();
    $v = $e[$key] ?? (getenv($key) ?: $default);
    return is_string($v) ? $v : $default;
}

function json_out(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, max-age=60');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function client_ip(): string
{
    foreach (['HTTP_X_NEXLIFY_VIEWER_IP', 'HTTP_X_NEXLIFY_CLIENT_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR'] as $h) {
        $v = $_SERVER[$h] ?? '';
        if (is_string($v) && $v !== '') {
            return trim(explode(',', $v)[0]);
        }
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

function pg_pdo(): ?\PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $url = cfg('DATABASE_URL');
    if ($url === '') {
        $pdo = null;
        return null;
    }
    try {
        // postgresql://user:pass@host:5432/db?query…
        $parts = parse_url($url);
        if (!$parts || empty($parts['host'])) {
            $pdo = null;
            return null;
        }
        $user = $parts['user'] ?? 'nexlify';
        $pass = $parts['pass'] ?? '';
        $host = $parts['host'];
        $port = $parts['port'] ?? 5432;
        $db = ltrim($parts['path'] ?? '/nexlify', '/');
        // Strip Prisma/query params from dbname
        if (str_contains($db, '?')) {
            $db = explode('?', $db, 2)[0];
        }
        $pdo = new \PDO(
            "pgsql:host={$host};port={$port};dbname={$db}",
            rawurldecode((string) $user),
            rawurldecode((string) $pass),
            [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            ]
        );
        // Panel host TZ is often Europe/*; without UTC, NOW() is stored as wall-clock
        // and Prisma/UI treat it as UTC → Live Connections uptime stuck at 00m 00s.
        $pdo->exec("SET TIME ZONE 'UTC'");
    } catch (\Throwable $e) {
        error_log('[panel-php] pg: ' . $e->getMessage());
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
    $url = cfg('REDIS_URL', 'redis://127.0.0.1:6379/3');
    $parts = parse_url($url);
    try {
        $redis = new \Redis();
        $host = $parts['host'] ?? '127.0.0.1';
        $port = (int) ($parts['port'] ?? 6379);
        $redis->connect($host, $port, 1.5);
        if (!empty($parts['pass'])) {
            $redis->auth(rawurldecode($parts['pass']));
        }
        $path = isset($parts['path']) ? trim($parts['path'], '/') : '3';
        if ($path !== '' && ctype_digit($path)) {
            $redis->select((int) $path);
        }
        $r = $redis;
    } catch (\Throwable $e) {
        $r = null;
    }
    return $r;
}

function cuid_to_num(string $id): int
{
    $h = 0;
    $len = strlen($id);
    for ($i = 0; $i < $len; $i++) {
        $h = (($h << 5) - $h + ord($id[$i])) | 0;
    }
    return abs($h);
}

function is_safe_upstream(string $url): bool
{
    if ($url === '') {
        return false;
    }
    if (!preg_match('#^https?://#i', $url)) {
        return false;
    }
    return true;
}

function line_is_playable(array $line): bool
{
    $status = (string) ($line['status'] ?? '');
    if ($status === 'BANNED' || $status === 'DISABLED') {
        return false;
    }
    $exp = $line['expiresAt'] ?? null;
    if ($exp) {
        $t = strtotime((string) $exp);
        if ($t !== false && $t < time()) {
            return false;
        }
    }
    return $status === 'ACTIVE';
}

function find_line_by_username(string $username): ?array
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return null;
    }
    $st = $pdo->prepare('SELECT * FROM "Line" WHERE username = ? LIMIT 1');
    $st->execute([$username]);
    $row = $st->fetch();
    return $row ?: null;
}

function find_line_by_credentials(string $username, string $password): ?array
{
    $line = find_line_by_username($username);
    if (!$line) {
        return null;
    }
    if ((string) $line['password'] !== $password) {
        return null;
    }
    return $line;
}

function authorize_internal_request(): bool
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $presented = '';
    if (is_string($auth) && preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
        $presented = $m[1];
    }
    $secret = cfg('PANEL_INTERNAL_SECRET');
    $agent = cfg('AGENT_TOKEN');
    $headerSecret = $_SERVER['HTTP_X_PANEL_INTERNAL_SECRET'] ?? '';
    if ($secret !== '' && ($presented === $secret || hash_equals($secret, (string) $headerSecret))) {
        return true;
    }
    if ($agent !== '' && $presented === $agent) {
        return true;
    }
    // Loopback without secret still blocked — require configured secret
    return false;
}

function resolve_stream_id(string $raw, ?string $username = null): ?string
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return null;
    }
    $id = preg_replace('/\.(ts|m3u8|mp4|mkv|avi|mov|webm)$/i', '', trim($raw)) ?? '';
    if ($id === '') {
        return null;
    }
    if (!preg_match('/^-?\d+$/', $id)) {
        $st = $pdo->prepare('SELECT id FROM "Stream" WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $row = $st->fetch();
        return $row ? (string) $row['id'] : $id;
    }
    $num = abs((int) $id);
    // Prefer xtreamNum index
    $st = $pdo->prepare('SELECT id FROM "Stream" WHERE "xtreamNum" = ? AND "isActive" = true LIMIT 8');
    $st->execute([$num]);
    $rows = $st->fetchAll();
    if ($rows) {
        if (!$username) {
            return (string) $rows[0]['id'];
        }
        $line = find_line_by_username($username);
        if (!$line) {
            return (string) $rows[0]['id'];
        }
        foreach ($rows as $r) {
            if (line_has_stream((string) $line['id'], (string) $r['id'])) {
                return (string) $r['id'];
            }
        }
        return null;
    }
    // Fallback: hash match within line bouquet (bounded)
    if ($username) {
        $line = find_line_by_username($username);
        if ($line) {
            $st = $pdo->prepare(
                'SELECT s.id FROM "LineBouquet" lb
                 INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
                 INNER JOIN "Stream" s ON s.id = bs."streamId"
                 WHERE lb."lineId" = ? AND s."isActive" = true AND s.type = \'LIVE\'
                 LIMIT 5000'
            );
            $st->execute([(string) $line['id']]);
            foreach ($st->fetchAll() as $r) {
                if (cuid_to_num((string) $r['id']) === $num) {
                    return (string) $r['id'];
                }
            }
        }
    }
    return null;
}

function line_has_stream(string $lineId, string $streamId): bool
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return false;
    }
    $st = $pdo->prepare(
        'SELECT 1 FROM "LineBouquet" lb
         INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
         WHERE lb."lineId" = ? AND bs."streamId" = ?
         LIMIT 1'
    );
    $st->execute([$lineId, $streamId]);
    return (bool) $st->fetchColumn();
}

function get_stream(string $streamId): ?array
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return null;
    }
    $st = $pdo->prepare('SELECT * FROM "Stream" WHERE id = ? LIMIT 1');
    $st->execute([$streamId]);
    $row = $st->fetch();
    return $row ?: null;
}

function count_line_connections(string $lineId): int
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return 0;
    }
    // Distinct viewer sessions (ip+stream), exclude catalog-api marker rows.
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM (
           SELECT 1 FROM "LiveConnection" lc
           LEFT JOIN "Stream" s ON s.id = lc."streamId"
           WHERE lc."lineId" = ?
             AND lc."lastSeenAt" > NOW() - INTERVAL \'120 seconds\'
             AND COALESCE(s."channelId", \'\') <> \'__nexlify_xtream_api__\'
           GROUP BY lc.ip, lc."streamId"
         ) t'
    );
    $st->execute([$lineId]);
    return (int) $st->fetchColumn();
}

/**
 * Drop surplus LiveConnection rows so a line stays within maxConnections.
 * maxConnections<=1: keep only this stream (+ this IP when set); classic zap.
 */
function prune_line_connections(string $lineId, string $streamId, string $ip, int $maxConn): void
{
    $pdo = pg_pdo();
    if (!$pdo || $lineId === '' || $streamId === '' || $maxConn <= 0) {
        return;
    }
    try {
        if ($maxConn <= 1) {
            // Same stream, any IP stays (HLS vs MPEG-TS / CGNAT). Drop other channels only.
            $st = $pdo->prepare(
                'DELETE FROM "LiveConnection"
                 WHERE "lineId" = ? AND "streamId" <> ?'
            );
            $st->execute([$lineId, $streamId]);
            return;
        }
        // Keep newest (maxConn) distinct ip+stream sessions; drop the rest.
        $st = $pdo->prepare(
            'DELETE FROM "LiveConnection" WHERE id IN (
               SELECT id FROM (
                 SELECT lc.id,
                   ROW_NUMBER() OVER (
                     PARTITION BY lc."lineId"
                     ORDER BY
                       CASE WHEN lc."streamId" = ? AND lc.ip = ? THEN 0 ELSE 1 END,
                       lc."lastSeenAt" DESC
                   ) AS rn
                 FROM "LiveConnection" lc
                 LEFT JOIN "Stream" s ON s.id = lc."streamId"
                 WHERE lc."lineId" = ?
                   AND COALESCE(s."channelId", \'\') <> \'__nexlify_xtream_api__\'
               ) ranked
               WHERE rn > ?
             )'
        );
        $st->execute([$streamId, $ip, $lineId, $maxConn]);
    } catch (\Throwable $e) {
        // ignore
    }
}

function line_has_connection_capacity(string $lineId, string $streamId, string $ip, int $maxConn): bool
{
    if ($maxConn <= 0) {
        return true;
    }
    // maxConnections=1: always admit; prune_line_connections reclaims the prior session.
    if ($maxConn === 1) {
        return true;
    }
    $pdo = pg_pdo();
    if (!$pdo) {
        return true;
    }
    try {
        // Same stream+ip reconnect always ok.
        $st = $pdo->prepare(
            'SELECT 1 FROM "LiveConnection"
             WHERE "lineId" = ? AND "streamId" = ? AND ip = ?
               AND "lastSeenAt" > NOW() - INTERVAL \'120 seconds\'
             LIMIT 1'
        );
        $st->execute([$lineId, $streamId, $ip]);
        if ($st->fetchColumn()) {
            return true;
        }
        $active = count_line_connections($lineId);
        if ($active < $maxConn) {
            return true;
        }
        // At capacity: allow only an existing IP continuing (zap / refresh).
        if ($ip === '') {
            return false;
        }
        $st = $pdo->prepare(
            'SELECT COUNT(DISTINCT "streamId") FROM "LiveConnection"
             WHERE "lineId" = ? AND ip = ?
               AND "lastSeenAt" > NOW() - INTERVAL \'120 seconds\''
        );
        $st->execute([$lineId, $ip]);
        return ((int) $st->fetchColumn()) > 0;
    } catch (\Throwable $e) {
        return true;
    }
}

function track_connection(string $lineId, string $streamId, string $ip, ?string $ua, int $maxConn = 0): void
{
    $pdo = pg_pdo();
    if (!$pdo || $lineId === '' || $streamId === '') {
        return;
    }
    $ip = trim($ip);
    $id = 'c' . base_convert((string) time(), 10, 36) . bin2hex(random_bytes(8));
    try {
        $st = $pdo->prepare(
            'INSERT INTO "LiveConnection" (id, "lineId", "streamId", ip, "userAgent", "startedAt", "lastSeenAt")
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())
             ON CONFLICT ("lineId", "streamId", ip)
             DO UPDATE SET "lastSeenAt" = NOW(),
               "userAgent" = COALESCE(EXCLUDED."userAgent", "LiveConnection"."userAgent")'
        );
        $st->execute([$id, $lineId, $streamId, $ip, $ua]);

        // Keep manage-lines "last watched" / connection info in sync with playback.
        $lineSt = $pdo->prepare(
            'UPDATE "Line" SET "lastWatchedAt" = NOW(), "lastWatchedStreamId" = ?,
               "lastWatchedIp" = CASE WHEN ? <> \'\' THEN ? ELSE "lastWatchedIp" END
             WHERE id = ?'
        );
        $lineSt->execute([$streamId, $ip, $ip, $lineId]);

        if ($maxConn > 0) {
            prune_line_connections($lineId, $streamId, $ip, $maxConn);
        }
    } catch (\Throwable $e) {
        // ignore
    }
}

function cache_get(string $key): ?string
{
    $r = redis_client();
    if (!$r) {
        return null;
    }
    try {
        $v = $r->get($key);
        return is_string($v) ? $v : null;
    } catch (\Throwable $e) {
        return null;
    }
}

function cache_set(string $key, string $value, int $ttl): void
{
    $r = redis_client();
    if (!$r) {
        return;
    }
    try {
        $r->setex($key, max(1, $ttl), $value);
    } catch (\Throwable $e) {
        // ignore
    }
}

function request_host(): string
{
    $h = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '';
    $h = explode(',', (string) $h)[0];
    $h = trim(explode(':', $h)[0]);
    return $h !== '' ? $h : '127.0.0.1';
}

function request_port(): string
{
    $xf = $_SERVER['HTTP_X_FORWARDED_PORT'] ?? '';
    if ($xf !== '' && ctype_digit((string) $xf)) {
        return (string) $xf;
    }
    $sp = $_SERVER['SERVER_PORT'] ?? '';
    if ($sp !== '' && ctype_digit((string) $sp)) {
        // Behind nginx → Next was 13000; PHP panel should advertise client port
        if ((int) $sp === 13000 || (int) $sp === 9000) {
            return cfg('STREAM_HTTP_PORT', '80');
        }
        return (string) $sp;
    }
    return cfg('STREAM_HTTP_PORT', '80');
}

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

function parse_xtream_path(string $uri): ?array
{
    $path = parse_url($uri, PHP_URL_PATH) ?: $uri;
    $parts = array_values(array_filter(explode('/', $path), static fn ($p) => $p !== ''));
    if (count($parts) < 2) {
        return null;
    }
    $kind = $parts[0];

    // /play/{token} — stream id embedded in token
    if ($kind === 'play' && count($parts) >= 2) {
        $tok = parse_play_token(rawurldecode((string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $parts[1])));
        if (!$tok || $tok['streamId'] === '') {
            return null;
        }
        return [
            'kind' => 'live',
            'username' => $tok['username'],
            'password' => $tok['password'],
            'streamKey' => $tok['streamId'],
            'durationMin' => 0,
            'start' => '',
            'wantsHls' => str_ends_with(strtolower($parts[1]), '.m3u8'),
            'spliceLiveTs' => true,
            'spliceVod' => false,
            'isTimeshift' => false,
        ];
    }

    // /auth/{token} — credential probe (optional stream in token)
    if ($kind === 'auth' && count($parts) >= 2) {
        $tok = parse_play_token(rawurldecode($parts[1]));
        if (!$tok) {
            return null;
        }
        return [
            'kind' => 'auth',
            'username' => $tok['username'],
            'password' => $tok['password'],
            'streamKey' => $tok['streamId'] !== '' ? $tok['streamId'] : '_auth_',
            'durationMin' => 0,
            'start' => '',
            'wantsHls' => false,
            'spliceLiveTs' => false,
            'spliceVod' => false,
            'isTimeshift' => false,
        ];
    }

    if (!in_array($kind, ['live', 'movie', 'series', 'timeshift'], true)) {
        return null;
    }

    // XC: /timeshift/{user}/{pass}/{durationMin}/{start}/{streamId}.ts
    if ($kind === 'timeshift') {
        if (count($parts) < 6) {
            return null;
        }
        $rawKey = rawurldecode($parts[5]);
        return [
            'kind' => 'timeshift',
            'username' => rawurldecode($parts[1]),
            'password' => rawurldecode($parts[2]),
            'durationMin' => max(1, min(24 * 60, (int) $parts[3])),
            'start' => rawurldecode($parts[4]),
            'streamKey' => (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawKey),
            'wantsHls' => str_ends_with(strtolower($rawKey), '.m3u8'),
            'spliceLiveTs' => false,
            'spliceVod' => false,
            'isTimeshift' => true,
        ];
    }

    // Token form: /live/{token}/{streamId}.ext  (3 segments)
    if (count($parts) === 3 && looks_like_play_token(rawurldecode($parts[1]))) {
        $tok = parse_play_token(rawurldecode($parts[1]));
        if (!$tok) {
            return null;
        }
        $rawKey = rawurldecode($parts[2]);
        $streamKey = (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawKey);
        if ($tok['streamId'] !== '' && $streamKey === '') {
            $streamKey = $tok['streamId'];
        }
        return [
            'kind' => $kind,
            'username' => $tok['username'],
            'password' => $tok['password'],
            'streamKey' => $streamKey,
            'durationMin' => 0,
            'start' => '',
            'wantsHls' => str_ends_with(strtolower($rawKey), '.m3u8'),
            'spliceLiveTs' => $kind === 'live',
            'spliceVod' => $kind === 'movie' || $kind === 'series',
            'isTimeshift' => false,
        ];
    }

    if (count($parts) < 4) {
        return null;
    }

    $rawKey = rawurldecode($parts[3]);
    return [
        'kind' => $kind,
        'username' => rawurldecode($parts[1]),
        'password' => rawurldecode($parts[2]),
        'streamKey' => (string) preg_replace('/\.(ts|m3u8|mp4)$/i', '', $rawKey),
        'durationMin' => 0,
        'start' => '',
        'wantsHls' => str_ends_with(strtolower($rawKey), '.m3u8')
            || (isset($parts[4]) && str_contains(strtolower($parts[4]), 'm3u8')),
        'spliceLiveTs' => $kind === 'live',
        'spliceVod' => $kind === 'movie' || $kind === 'series',
        'isTimeshift' => false,
    ];
}

/** Rewrite a live upstream URL into an XC timeshift URL on the same origin. */
function xtream_timeshift_source_url(string $liveUrl, int $durationMinutes, string $start): ?string
{
    $liveUrl = trim($liveUrl);
    if ($liveUrl === '' || !preg_match('#^https?://#i', $liveUrl)) {
        return null;
    }
    $parts = parse_url($liveUrl);
    if (!$parts || empty($parts['host'])) {
        return null;
    }
    $duration = max(1, min(24 * 60, $durationMinutes));
    $startSeg = preg_match('/^[0-9A-Za-z:_-]+$/', $start)
        ? $start
        : rawurlencode(str_replace('\\', '', $start));
    $path = rtrim((string) ($parts['path'] ?? ''), '/');
    $newPath = null;
    if (preg_match('#^(.*)/live/([^/]+)/([^/]+)/([^/]+?)(\.ts)?$#i', $path, $m)) {
        $ext = $m[5] !== '' ? $m[5] : '.ts';
        $newPath = "{$m[1]}/timeshift/{$m[2]}/{$m[3]}/{$duration}/{$startSeg}/{$m[4]}{$ext}";
    } elseif (preg_match('#^(.*)/([^/]+)/([^/]+)/(\d+)(\.ts)?$#i', $path, $m)) {
        $ext = ($m[5] ?? '') !== '' ? $m[5] : '.ts';
        $newPath = "{$m[1]}/timeshift/{$m[2]}/{$m[3]}/{$duration}/{$startSeg}/{$m[4]}{$ext}";
    }
    if ($newPath === null) {
        return null;
    }
    $scheme = $parts['scheme'] ?? 'http';
    $host = $parts['host'];
    $port = isset($parts['port']) ? ':' . $parts['port'] : '';
    $query = isset($parts['query']) ? '?' . $parts['query'] : '';
    return "{$scheme}://{$host}{$port}{$newPath}{$query}";
}

function xtream_unauth(string $host, string $httpPort, string $httpsPort): array
{
    return [
        'user_info' => [
            'auth' => 0,
            'status' => 'Disabled',
            'message' => 'Invalid credentials',
        ],
        'server_info' => [
            'url' => $host,
            'port' => $httpPort,
            'https_port' => $httpsPort,
            'server_protocol' => 'http',
            'rtmp_port' => '0',
            'timezone' => cfg('PANEL_TIMEZONE', 'Europe/London'),
            'timestamp_now' => time(),
        ],
    ];
}

function server_info_for_line(array $line, string $host, string $clientPort): array
{
    $httpPort = cfg('STREAM_HTTP_PORT', '80');
    $httpsPort = cfg('STREAM_HTTPS_PORT', '443');
    // Prefer the port the client connected on (80/8080/443)
    if (in_array($clientPort, ['80', '8080', '443'], true)) {
        $httpPort = $clientPort === '443' ? $httpPort : $clientPort;
        if ($clientPort === '443') {
            $httpsPort = '443';
        }
    }
    // Bare IP: advertise https_port same as http for non-TLS edge
    $isIp = (bool) filter_var($host, FILTER_VALIDATE_IP);
    if ($isIp) {
        $httpsPort = $httpPort;
    }
    $tz = cfg('PANEL_TIMEZONE', 'Europe/London');
    try {
        $dt = new \DateTime('now', new \DateTimeZone($tz));
        $clock = $dt->format('Y-m-d H:i:s');
    } catch (\Throwable $e) {
        $clock = gmdate('Y-m-d H:i:s');
    }
    $active = count_line_connections((string) $line['id']);
    return [
        'url' => $host,
        'port' => $httpPort,
        'https_port' => $httpsPort,
        'server_protocol' => 'http',
        'rtmp_port' => '0',
        'timezone' => $tz,
        'timestamp_now' => time(),
        'time_now' => $clock,
        'time' => $clock,
        '_active_cons' => $active,
    ];
}

function user_info_payload(array $line, array $serverInfo): array
{
    $playable = line_is_playable($line);
    $exp = strtotime((string) ($line['expiresAt'] ?? '')) ?: time();
    $created = strtotime((string) ($line['createdAt'] ?? '')) ?: time();
    return [
        'username' => $line['username'],
        'password' => $line['password'],
        'message' => $playable ? '' : 'Account inactive or expired',
        'auth' => $playable ? 1 : 0,
        'status' => $playable ? 'Active' : 'Disabled',
        'exp_date' => (string) $exp,
        'is_trial' => '0',
        'active_cons' => (string) ($serverInfo['_active_cons'] ?? 0),
        'created_at' => (string) $created,
        'max_connections' => (string) max(0, (int) ($line['maxConnections'] ?? 1)),
        'allowed_output_formats' => ['ts', 'm3u8', 'rtmp'],
    ];
}

function streams_for_line(string $lineId, string $type, ?string $categoryId = null): array
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return [];
    }
    $sql = 'SELECT DISTINCT s.id, s.name, s."streamIcon", s."categoryId", s."containerExtension",
                   s."seriesName", s."seasonNum", s."episodeNum", s."xtreamNum", s."sortOrder"
            FROM "LineBouquet" lb
            INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
            INNER JOIN "Stream" s ON s.id = bs."streamId"
            WHERE lb."lineId" = ? AND s."isActive" = true AND s.type = ?';
    $params = [$lineId, $type];
    if ($categoryId !== null && $categoryId !== '' && $categoryId !== '0') {
        if (preg_match('/^\d+$/', $categoryId)) {
            // Resolve numeric category via hash among line categories — skip filter if unresolved
            $cat = resolve_category_id($categoryId);
            if ($cat) {
                $sql .= ' AND s."categoryId" = ?';
                $params[] = $cat;
            }
        } else {
            $sql .= ' AND s."categoryId" = ?';
            $params[] = $categoryId;
        }
    }
    $sql .= ' ORDER BY s."sortOrder" ASC, s.name ASC LIMIT 20000';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchAll() ?: [];
}

function resolve_category_id(string $raw): ?string
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return null;
    }
    if (!preg_match('/^\d+$/', $raw)) {
        return $raw;
    }
    $num = (int) $raw;
    $cached = cache_get('panelphp:cat:' . $raw);
    if ($cached) {
        return $cached;
    }
    $st = $pdo->query('SELECT id FROM "Category" LIMIT 20000');
    foreach ($st->fetchAll() as $row) {
        if (cuid_to_num((string) $row['id']) === $num) {
            cache_set('panelphp:cat:' . $raw, (string) $row['id'], 300);
            return (string) $row['id'];
        }
    }
    return null;
}

function categories_for_line(string $lineId, string $type): array
{
    $pdo = pg_pdo();
    if (!$pdo) {
        return [];
    }
    $st = $pdo->prepare(
        'SELECT DISTINCT c.id, c.name, c."sortOrder"
         FROM "LineBouquet" lb
         INNER JOIN "BouquetStream" bs ON bs."bouquetId" = lb."bouquetId"
         INNER JOIN "Stream" s ON s.id = bs."streamId"
         INNER JOIN "Category" c ON c.id = s."categoryId"
         WHERE lb."lineId" = ? AND s."isActive" = true AND s.type = ?
         ORDER BY c."sortOrder" ASC, c.name ASC
         LIMIT 2000'
    );
    $st->execute([$lineId, $type]);
    return $st->fetchAll() ?: [];
}
