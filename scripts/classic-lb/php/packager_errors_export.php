<?php
declare(strict_types=1);

/**
 * Export recent classic-LB FFmpeg packager errors for the panel Stream logs sync.
 * Auth: Bearer AGENT_TOKEN or PANEL_INTERNAL_SECRET (same as connections.json).
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{json_out, cfg, stream_root, safe_stream_id};

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_PANEL_AGENT_TOKEN'] ?? '';
$token = cfg('AGENT_TOKEN');
$internal = cfg('PANEL_INTERNAL_SECRET');
$presented = '';
if (is_string($auth) && preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
    $presented = $m[1];
} elseif (is_string($auth) && $auth !== '') {
    $presented = $auth;
}
$ok = false;
if ($presented !== '') {
    if ($token !== '' && hash_equals($token, $presented)) {
        $ok = true;
    } elseif ($internal !== '' && hash_equals($internal, $presented)) {
        $ok = true;
    }
}
if (!$ok) {
    json_out(['ok' => false, 'error' => 'forbidden'], 403);
}

$logDir = rtrim(stream_root(), '/') . '/logs';
$lookback = max(4096, min(262144, (int) ($_GET['bytes'] ?? 65536)));
$maxFiles = max(5, min(120, (int) ($_GET['max'] ?? 40)));
$events = [];

$rules = [
    ['re' => '/Stream ends prematurely/i', 'action' => 'playback_origin_fail', 'label' => 'upstream drop (stream ended prematurely)'],
    ['re' => '/Will reconnect/i', 'action' => 'playback_origin_fail', 'label' => 'upstream reconnect'],
    ['re' => '/Packet corrupt/i', 'action' => 'playback_stutter', 'label' => 'bad packet (corrupt TS)'],
    ['re' => '/timestamp discontinuity/i', 'action' => 'playback_stutter', 'label' => 'timeline jump (timestamp discontinuity)'],
    ['re' => '/DTS .+ out of order/i', 'action' => 'playback_stutter', 'label' => 'timeline jump (DTS out of order)'],
    ['re' => '/Server returned 4\d\d|HTTP error|403 Forbidden|404 Not Found/i', 'action' => 'playback_origin_fail', 'label' => 'upstream HTTP error'],
    ['re' => '/Connection refused|Connection reset|Network is unreachable|Input\/output error/i', 'action' => 'playback_origin_fail', 'label' => 'upstream I/O / connection error'],
];
$ignore = '/Broken pipe|Error writing trailer|Error closing file|Error muxing a packet|Error submitting a packet to the muxer|append_list mode does not support/i';

if (is_dir($logDir)) {
    $files = glob($logDir . '/*.log') ?: [];
    usort($files, static function ($a, $b) {
        return (filemtime($b) ?: 0) <=> (filemtime($a) ?: 0);
    });
    $files = array_slice($files, 0, $maxFiles);
    foreach ($files as $path) {
        $base = basename($path);
        if (str_ends_with($base, '-mpegts.log')) {
            continue;
        }
        $streamId = safe_stream_id(preg_replace('/\.log$/i', '', $base) ?: '');
        if ($streamId === '' || $streamId === 'x') {
            continue;
        }
        $size = @filesize($path);
        if ($size === false || $size <= 0) {
            continue;
        }
        $start = max(0, $size - $lookback);
        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            continue;
        }
        if ($start > 0) {
            fseek($fh, $start);
        }
        $text = stream_get_contents($fh) ?: '';
        fclose($fh);
        $seen = [];
        foreach (preg_split("/\r?\n/", $text) as $line) {
            $line = trim($line);
            if ($line === '' || preg_match($ignore, $line)) {
                continue;
            }
            foreach ($rules as $rule) {
                if (!preg_match($rule['re'], $line)) {
                    continue;
                }
                $key = $rule['action'] . '|' . $rule['label'];
                if (isset($seen[$key])) {
                    break;
                }
                $seen[$key] = true;
                $events[] = [
                    'streamId' => $streamId,
                    'action' => $rule['action'],
                    'label' => $rule['label'],
                    'sample' => substr($line, 0, 220),
                    'log' => $base,
                    'mtime' => gmdate('c', filemtime($path) ?: time()),
                ];
                break;
            }
        }
    }
}

json_out([
    'ok' => true,
    'role' => 'classic-lb',
    'count' => count($events),
    'events' => $events,
    'at' => gmdate('c'),
]);
