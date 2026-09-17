<?php
declare(strict_types=1);

/**
 * Internal MPEG-TS remux — reads shared HLS packager, copy-remux to pipe.
 * Called only after nginx auth_request; never holds upstream bitrate itself.
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{cfg, safe_stream_id, stream_root, hls_index_ready};

$safe = (string) ($_GET['safe'] ?? $_SERVER['HTTP_X_NEXLIFY_SAFE'] ?? '');
$safe = safe_stream_id($safe);
if ($safe === '' || $safe === 'x') {
    http_response_code(400);
    exit;
}

$hlsDir = stream_root() . '/hls/' . $safe;
$index = $hlsDir . '/index.m3u8';
if (!hls_index_ready($hlsDir)) {
    http_response_code(503);
    header('X-Nexlify-Deny: ffmpeg_pending');
    exit;
}

$ffmpeg = cfg('FFMPEG_BIN', '/usr/local/bin/ffmpeg');
if (!is_executable($ffmpeg)) {
    $ffmpeg = '/usr/bin/ffmpeg';
}
if (!is_executable($ffmpeg)) {
    http_response_code(503);
    header('X-Nexlify-Deny: no_ffmpeg');
    exit;
}

@ini_set('zlib.output_compression', '0');
@ini_set('implicit_flush', '1');
while (ob_get_level() > 0) {
    ob_end_clean();
}
header('Content-Type: video/mp2t');
header('Cache-Control: no-cache, no-store');
header('X-Nexlify-LB: classic-ffmpeg-mpegts');
header('Connection: close');
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', '1');
}
ignore_user_abort(true);
set_time_limit(0);

$viewers = stream_root() . '/viewers';
if (!is_dir($viewers)) {
    @mkdir($viewers, 0755, true);
}
@file_put_contents($viewers . '/' . $safe, (string) time());

$cmd = sprintf(
    '%s -hide_banner -loglevel error -fflags +genpts+nobuffer -flags low_delay ' .
    '-live_start_index -1 -i %s -map 0:v:0? -map 0:a:0? -c copy -f mpegts -mpegts_flags +resend_headers pipe:1',
    escapeshellarg($ffmpeg),
    escapeshellarg($index)
);

$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['file', stream_root() . '/logs/' . $safe . '-mpegts.log', 'a'],
];
$proc = proc_open($cmd, $descriptors, $pipes, null, null, ['bypass_shell' => false]);
if (!is_resource($proc)) {
    http_response_code(503);
    exit;
}
fclose($pipes[0]);
stream_set_blocking($pipes[1], true);

while (!feof($pipes[1])) {
    if (connection_aborted()) {
        break;
    }
    $chunk = fread($pipes[1], 65536);
    if ($chunk === false || $chunk === '') {
        if (!proc_get_status($proc)['running']) {
            break;
        }
        usleep(20000);
        continue;
    }
    echo $chunk;
    flush();
}

fclose($pipes[1]);
$status = proc_get_status($proc);
if (!empty($status['running'])) {
    proc_terminate($proc, 15);
    usleep(100000);
    $status = proc_get_status($proc);
    if (!empty($status['running'])) {
        proc_terminate($proc, 9);
    }
}
proc_close($proc);
exit;
