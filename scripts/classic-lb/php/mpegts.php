<?php
declare(strict_types=1);

/**
 * Internal MPEG-TS delivery — cold: direct upstream remux; warm: concatenate
 * shared HLS .ts segments (already MPEG-TS — no second ffmpeg remux).
 *
 * Viewer heartbeat keeps the idle reaper from killing the shared packager.
 * Sessions run until the client disconnects (no hard 120s cutoff).
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    cfg,
    safe_stream_id,
    stream_root,
    hls_index_ready,
    source_url_for_safe,
    mode_for_safe,
    heartbeat_viewer,
    ffmpeg_copy_input_args
};

$safe = (string) ($_GET['safe'] ?? $_SERVER['HTTP_X_NEXLIFY_SAFE'] ?? '');
$safe = safe_stream_id($safe);
if ($safe === '' || $safe === 'x') {
    http_response_code(400);
    exit;
}

$hlsDir = stream_root() . '/hls/' . $safe;
$directUrl = source_url_for_safe($safe);
$deliveryMode = mode_for_safe($safe);
$directOnly = $deliveryMode === 'vod' || $deliveryMode === 'timeshift';

$ffmpeg = cfg('FFMPEG_BIN', '/usr/local/bin/ffmpeg');
if (!is_executable($ffmpeg)) {
    $ffmpeg = '/usr/bin/ffmpeg';
}
if (!is_executable($ffmpeg)) {
    http_response_code(503);
    header('X-Nexlify-Deny: no_ffmpeg');
    exit;
}

if (!$directOnly && !hls_index_ready($hlsDir) && ($directUrl === null || $directUrl === '')) {
    http_response_code(503);
    header('X-Nexlify-Deny: ffmpeg_pending');
    exit;
}
if ($directOnly && ($directUrl === null || $directUrl === '')) {
    http_response_code(503);
    header('X-Nexlify-Deny: no_source');
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
$viewerFile = $viewers . '/' . $safe;
$bytesSent = 0;
$touchViewer = static function () use ($viewerFile, $safe, &$bytesSent): void {
    @file_put_contents($viewerFile, (string) time());
    // Keep Live Connections alive for the duration of the MPEG-TS pull
    // (auth_request only runs once at open — without this, rows vanish ~2min).
    heartbeat_viewer($safe, $bytesSent);
};
$touchViewer();
$lastTouch = time();

/**
 * Warm path: HLS segments are already MPEG-TS — stream them directly.
 * Runs until the client disconnects, HLS disappears, or packager idles too long.
 * Returns true if any bytes were sent.
 */
$streamHlsSegments = static function () use ($hlsDir, $touchViewer, &$lastTouch, &$bytesSent): bool {
    $sentAny = false;
    $lastSeg = '';
    $offset = 0;
    $idleRounds = 0;
    $maxIdleRounds = 80; // ~3s of 40ms waits at live edge (stay on HLS, no remux hop)

    while (!connection_aborted()) {
        if (!hls_index_ready($hlsDir)) {
            break;
        }
        $segs = glob($hlsDir . '/seg*.ts') ?: [];
        if (!$segs) {
            usleep(40000);
            $idleRounds++;
            if ($idleRounds > $maxIdleRounds) {
                break;
            }
            continue;
        }
        natsort($segs);
        $segs = array_values($segs);
        // Instant picture: start on a segment that already has TS. Prefer newest
        // if it has grown; otherwise the previous complete segment (no 1s wait).
        if ($lastSeg === '') {
            $n = count($segs);
            $newest = $segs[$n - 1];
            $newestSize = (int) (@filesize($newest) ?: 0);
            if ($n >= 2 && $newestSize < 8192) {
                $lastSeg = $segs[$n - 2];
            } else {
                $lastSeg = $newest;
            }
            $offset = 0;
        }
        // Advance if a newer segment appeared.
        $idx = array_search($lastSeg, $segs, true);
        if ($idx === false) {
            // Window rotated — jump to newest finished seg.
            $lastSeg = count($segs) >= 2 ? $segs[count($segs) - 2] : $segs[count($segs) - 1];
            $offset = 0;
        } elseif ($idx < count($segs) - 1 && $offset > 0 && !is_file($lastSeg)) {
            $lastSeg = $segs[$idx + 1];
            $offset = 0;
        }

        $path = $lastSeg;
        if (!is_file($path)) {
            usleep(50000);
            continue;
        }
        $size = filesize($path);
        if ($size === false || $size < $offset) {
            // Segment rewritten/rotated.
            $offset = 0;
            usleep(50000);
            continue;
        }
        if ($size > $offset) {
            $fh = @fopen($path, 'rb');
            if ($fh === false) {
                usleep(50000);
                continue;
            }
            if ($offset > 0) {
                fseek($fh, $offset);
            }
            while (!feof($fh) && !connection_aborted()) {
                $chunk = fread($fh, 65536);
                if ($chunk === false || $chunk === '') {
                    break;
                }
                $offset += strlen($chunk);
                $bytesSent += strlen($chunk);
                $sentAny = true;
                $idleRounds = 0;
                echo $chunk;
                flush();
            }
            fclose($fh);
            $now = time();
            if (($now - $lastTouch) >= 10) {
                $touchViewer();
                $lastTouch = $now;
            }
        }

        // If we've consumed this segment and a newer one exists, advance.
        clearstatcache(true, $path);
        $sizeNow = @filesize($path);
        if ($sizeNow !== false && $offset >= $sizeNow) {
            $segs = glob($hlsDir . '/seg*.ts') ?: [];
            natsort($segs);
            $segs = array_values($segs);
            $idx = array_search($lastSeg, $segs, true);
            if ($idx !== false && $idx < count($segs) - 1) {
                $lastSeg = $segs[$idx + 1];
                $offset = 0;
                continue;
            }
            usleep(40000);
            $idleRounds++;
            if ($idleRounds > $maxIdleRounds) {
                break;
            }
        } else {
            usleep(25000);
        }
    }
    return $sentAny;
};

$openDirect = static function () use ($ffmpeg, $directUrl, $safe, $directOnly) {
    if ($directUrl === null || $directUrl === '') {
        return null;
    }
    $cmd = sprintf(
        '%s -hide_banner -loglevel error ' .
        '%s ' .
        '-i %s -map 0:v:0? -map 0:a:0? -c copy ' .
        '-flush_packets 1 -muxdelay 0 -muxpreload 0 -max_delay 0 -max_interleave_delta 0 ' .
        '-f mpegts -mpegts_flags +resend_headers pipe:1',
        escapeshellarg($ffmpeg),
        ffmpeg_copy_input_args($directOnly),
        escapeshellarg($directUrl)
    );
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['file', stream_root() . '/logs/' . $safe . '-mpegts.log', 'a'],
    ];
    $proc = proc_open($cmd, $descriptors, $pipes, null, null, ['bypass_shell' => false]);
    if (!is_resource($proc)) {
        return null;
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    return [$proc, $pipes[1]];
};

// Shared HLS concat for the whole .ts session when the packager is warm (1 ffmpeg
// per channel). Direct remux is zap-only until HLS is ready. Never hop after
// bytes have been sent — HLS↔direct switches tear the PCR and buffer players.
$preferHls = !$directOnly && hls_index_ready($hlsDir);
$remuxMode = $directOnly ? $deliveryMode : ($preferHls ? 'hls-seg' : 'direct');
header('X-Nexlify-Remux: ' . $remuxMode);
header('X-Nexlify-Mode: ' . $deliveryMode);

$maxRestarts = 500;
$restarts = 0;
$sentAny = false;
$lockedDirect = false; // zap path only; never after HLS bytes
$hlsSession = false;

while (!connection_aborted() && $restarts <= $maxRestarts) {
    if (!$directOnly && !$lockedDirect && hls_index_ready($hlsDir)) {
        if ($streamHlsSegments()) {
            $sentAny = true;
            $hlsSession = true;
        }
        if (connection_aborted()) {
            break;
        }
        if ($hlsSession) {
            // Packager hiccup — wait for the next segment, do not remux-hop.
            usleep(200000);
            $restarts++;
            $touchViewer();
            $lastTouch = time();
            continue;
        }
        // Cold playlist: no HLS bytes yet → one continuous direct zap.
        $lockedDirect = true;
    }

    if ($directUrl === null || $directUrl === '') {
        if (!$sentAny) {
            http_response_code(503);
            header('X-Nexlify-Deny: no_source');
        }
        usleep(250000);
        $restarts++;
        $touchViewer();
        $lastTouch = time();
        continue;
    }

    $opened = $openDirect();
    if ($opened === null) {
        usleep(100000);
        $restarts++;
        continue;
    }
    [$proc, $out] = $opened;
    $idleReads = 0;
    $firstByteDeadline = microtime(true) + ($directOnly ? 10.0 : 5.0);
    while (!feof($out)) {
        if (connection_aborted()) {
            break 2;
        }
        $now = time();
        if (($now - $lastTouch) >= 10) {
            $touchViewer();
            $lastTouch = $now;
        }
        // Stay on direct for the rest of this client session (no mid-stream HLS hop).
        $read = [$out];
        $write = null;
        $except = null;
        $n = @stream_select($read, $write, $except, 0, 200000);
        if ($n === false || $n === 0) {
            $st = proc_get_status($proc);
            if (empty($st['running'])) {
                break;
            }
            if (!$sentAny && microtime(true) > $firstByteDeadline) {
                break;
            }
            $idleReads++;
            if ($idleReads > 300) {
                break;
            }
            continue;
        }
        $chunk = fread($out, 65536);
        if ($chunk === false || $chunk === '') {
            $st = proc_get_status($proc);
            if (empty($st['running'])) {
                break;
            }
            $idleReads++;
            if ($idleReads > 300) {
                break;
            }
            continue;
        }
        $idleReads = 0;
        $sentAny = true;
        $bytesSent += strlen($chunk);
        echo $chunk;
        flush();
    }
    fclose($out);
    $status = proc_get_status($proc);
    if (!empty($status['running'])) {
        proc_terminate($proc, 15);
        usleep(80000);
        $status = proc_get_status($proc);
        if (!empty($status['running'])) {
            proc_terminate($proc, 9);
        }
    }
    proc_close($proc);
    if (connection_aborted()) {
        break;
    }
    if ($directOnly) {
        break;
    }
    $restarts++;
    usleep(80000);
    $touchViewer();
    $lastTouch = time();
}

exit;
