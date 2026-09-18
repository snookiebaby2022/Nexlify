<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{
    cfg,
    cuid_to_num,
    find_line_by_credentials,
    json_out,
    line_is_playable,
    request_host,
    request_port,
    server_info_for_line,
    streams_for_line,
    categories_for_line,
    user_info_payload,
    xtream_unauth,
    cache_get,
    cache_set
};

$username = $_GET['username'] ?? $_GET['user'] ?? $_POST['username'] ?? $_POST['user'] ?? null;
$password = $_GET['password'] ?? $_GET['pass'] ?? $_POST['password'] ?? $_POST['pass'] ?? null;
$action = $_GET['action'] ?? $_POST['action'] ?? null;

$host = request_host();
$clientPort = request_port();
$httpPort = cfg('STREAM_HTTP_PORT', '80');
$httpsPort = cfg('STREAM_HTTPS_PORT', '443');

if (!$username || !$password) {
    json_out(xtream_unauth($host, $httpPort, $httpsPort));
}

$line = find_line_by_credentials((string) $username, (string) $password);
if (!$line) {
    json_out(xtream_unauth($host, $httpPort, $httpsPort));
}

$si = server_info_for_line($line, $host, $clientPort);
unset($si['_active_cons_raw']);

if (!$action) {
    $ui = user_info_payload($line, $si);
    unset($si['_active_cons']);
    json_out([
        'user_info' => $ui,
        'server_info' => $si,
    ]);
}

if (!line_is_playable($line)) {
    $payload = xtream_unauth($host, $httpPort, $httpsPort);
    $payload['user_info']['message'] = 'Account inactive or expired';
    json_out($payload);
}

$lineId = (string) $line['id'];
$ttl = max(10, (int) cfg('CATALOG_CACHE_SECS', '60'));
$categoryId = isset($_GET['category_id']) ? (string) $_GET['category_id'] : null;

$mapLive = static function (array $rows): array {
    $out = [];
    foreach ($rows as $s) {
        $sid = (string) $s['id'];
        $num = isset($s['xtreamNum']) && $s['xtreamNum'] !== null
            ? (int) $s['xtreamNum']
            : cuid_to_num($sid);
        $out[] = [
            'num' => $num,
            'name' => $s['name'],
            'stream_type' => 'live',
            'stream_id' => $num,
            'stream_icon' => $s['streamIcon'] ?? '',
            'epg_channel_id' => '',
            'category_id' => $s['categoryId'] ? (string) cuid_to_num((string) $s['categoryId']) : '0',
            'tv_archive' => 0,
            'direct_source' => '',
            'tv_archive_duration' => 0,
        ];
    }
    return $out;
};

$mapCats = static function (array $rows): array {
    $out = [];
    foreach ($rows as $c) {
        $out[] = [
            'category_id' => (string) cuid_to_num((string) $c['id']),
            'category_name' => $c['name'],
            'parent_id' => 0,
        ];
    }
    return $out;
};

$mapVod = static function (array $rows): array {
    $out = [];
    foreach ($rows as $s) {
        $sid = (string) $s['id'];
        $num = isset($s['xtreamNum']) && $s['xtreamNum'] !== null
            ? (int) $s['xtreamNum']
            : cuid_to_num($sid);
        $ext = $s['containerExtension'] ?? 'mp4';
        $out[] = [
            'num' => $num,
            'name' => $s['name'],
            'stream_type' => 'movie',
            'stream_id' => $num,
            'stream_icon' => $s['streamIcon'] ?? '',
            'rating' => '0',
            'rating_5based' => 0,
            'category_id' => $s['categoryId'] ? (string) cuid_to_num((string) $s['categoryId']) : '0',
            'container_extension' => $ext,
            'direct_source' => '',
        ];
    }
    return $out;
};

$mapSeries = static function (array $rows): array {
    // Group by seriesName
    $by = [];
    foreach ($rows as $s) {
        $name = trim((string) ($s['seriesName'] ?? '')) ?: (string) $s['name'];
        if (!isset($by[$name])) {
            $sid = (string) $s['id'];
            $num = isset($s['xtreamNum']) && $s['xtreamNum'] !== null
                ? (int) $s['xtreamNum']
                : cuid_to_num($sid);
            $by[$name] = [
                'num' => $num,
                'name' => $name,
                'series_id' => $num,
                'cover' => $s['streamIcon'] ?? '',
                'plot' => '',
                'cast' => '',
                'director' => '',
                'genre' => '',
                'releaseDate' => '',
                'last_modified' => (string) time(),
                'rating' => '0',
                'rating_5based' => 0,
                'backdrop_path' => [],
                'youtube_trailer' => '',
                'episode_run_time' => '0',
                'category_id' => $s['categoryId'] ? (string) cuid_to_num((string) $s['categoryId']) : '0',
            ];
        }
    }
    return array_values($by);
};

switch ((string) $action) {
    case 'get_live_categories': {
        $key = "panelphp:live_cats:{$lineId}";
        $cached = cache_get($key);
        if ($cached) {
            json_out(json_decode($cached, true));
        }
        $payload = $mapCats(categories_for_line($lineId, 'LIVE'));
        cache_set($key, json_encode($payload, JSON_UNESCAPED_SLASHES), $ttl);
        json_out($payload);
    }
    case 'get_live_streams': {
        $key = "panelphp:live:{$lineId}:" . ($categoryId ?? '');
        $cached = cache_get($key);
        if ($cached) {
            json_out(json_decode($cached, true));
        }
        $payload = $mapLive(streams_for_line($lineId, 'LIVE', $categoryId));
        cache_set($key, json_encode($payload, JSON_UNESCAPED_SLASHES), $ttl);
        json_out($payload);
    }
    case 'get_vod_categories': {
        $payload = $mapCats(categories_for_line($lineId, 'MOVIE'));
        json_out($payload);
    }
    case 'get_vod_streams': {
        $payload = $mapVod(streams_for_line($lineId, 'MOVIE', $categoryId));
        json_out($payload);
    }
    case 'get_series_categories': {
        $payload = $mapCats(categories_for_line($lineId, 'SERIES'));
        json_out($payload);
    }
    case 'get_series': {
        $payload = $mapSeries(streams_for_line($lineId, 'SERIES', $categoryId));
        json_out($payload);
    }
    case 'get_series_info':
    case 'get_vod_info':
    case 'get_short_epg':
    case 'get_simple_data_table':
        json_out([]);
    case 'get_server_info': {
        unset($si['_active_cons']);
        json_out($si);
    }
    default: {
        // Unknown action — return user shell (XUI-ish)
        $ui = user_info_payload($line, $si);
        unset($si['_active_cons']);
        json_out(['user_info' => $ui, 'server_info' => $si]);
    }
}
