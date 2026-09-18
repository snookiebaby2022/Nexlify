<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{
    cuid_to_num,
    find_line_by_credentials,
    line_is_playable,
    request_host,
    request_port,
    streams_for_line,
    mint_play_token,
    cfg
};

$username = (string) ($_GET['username'] ?? '');
$password = (string) ($_GET['password'] ?? '');
$output = strtolower((string) ($_GET['output'] ?? 'ts'));

header('Content-Type: audio/x-mpegurl; charset=utf-8');
header('Cache-Control: private, max-age=60, must-revalidate');
header('Content-Disposition: attachment; filename="' . preg_replace('/[^a-zA-Z0-9._-]+/', '_', $username ?: 'playlist') . '.m3u"');

if ($username === '' || $password === '') {
    http_response_code(400);
    echo "#EXTM3U\n";
    exit;
}

$line = find_line_by_credentials($username, $password);
if (!$line || !line_is_playable($line)) {
    http_response_code(401);
    echo "#EXTM3U\n";
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
    http_response_code(200);
    exit;
}

$host = request_host();
$port = request_port();
$proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$xfProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
if ($xfProto === 'https' || $xfProto === 'http') {
    $proto = $xfProto;
}
$defaultPort = $proto === 'https' ? '443' : '80';
$portSuffix = ($port && $port !== $defaultPort) ? ':' . $port : '';
$base = "{$proto}://{$host}{$portSuffix}";
$ext = ($output === 'm3u8' || $output === 'hls') ? 'm3u8' : 'ts';
$useTokens = cfg('PLAY_TOKEN_URLS', '0') === '1' || cfg('PLAY_TOKEN_URLS', '') === 'true';

echo "#EXTM3U\n";
foreach (streams_for_line((string) $line['id'], 'LIVE') as $s) {
    $sid = (string) $s['id'];
    $num = isset($s['xtreamNum']) && $s['xtreamNum'] !== null
        ? (int) $s['xtreamNum']
        : cuid_to_num($sid);
    $name = str_replace(["\n", "\r"], ' ', (string) $s['name']);
    $logo = $s['streamIcon'] ?? '';
    echo '#EXTINF:-1';
    if ($logo) {
        echo ' tvg-logo="' . str_replace('"', '', (string) $logo) . '"';
    }
    echo ",{$name}\n";
    if ($useTokens) {
        $tok = mint_play_token($username, $password, (string) $num);
        echo "{$base}/live/" . rawurlencode($tok) . "/{$num}.{$ext}\n";
    } else {
        echo "{$base}/live/" . rawurlencode($username) . '/' . rawurlencode($password) . "/{$num}.{$ext}\n";
    }
}
