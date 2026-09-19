#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Restart shared FFmpeg packagers that are alive but no longer writing segments
 * while viewers are still watching. Run every minute from cron.
 */
require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{
    cfg,
    stream_root,
    safe_stream_id,
    packager_started,
    packager_stale,
    kill_packager,
    ensure_ffmpeg,
    source_url_for_safe
};

$root = stream_root();
$viewDir = $root . '/viewers';
$idle = max(60, (int) cfg('FFMPEG_IDLE_SECS', '300'));
$stale = max(8, min(60, (int) cfg('FFMPEG_STALE_SECS', '12')));
$now = time();
$restarted = 0;
$checked = 0;

if (!is_dir($viewDir)) {
    fwrite(STDOUT, "packager-watchdog viewers=0\n");
    exit(0);
}

foreach (scandir($viewDir) ?: [] as $name) {
    if ($name === '.' || $name === '..') {
        continue;
    }
    $path = $viewDir . '/' . $name;
    if (!is_file($path)) {
        continue;
    }
    $safe = safe_stream_id($name);
    $last = (int) trim((string) @file_get_contents($path));
    if ($last <= 0 || ($now - $last) > $idle) {
        continue;
    }
    $checked++;
    if (!packager_started($safe) || !packager_stale($safe, $stale)) {
        continue;
    }
    $url = source_url_for_safe($safe);
    if ($url === null || $url === '') {
        kill_packager($safe);
        fwrite(STDOUT, date('c') . " watchdog kill_no_url safe={$safe}\n");
        continue;
    }
    kill_packager($safe);
    ensure_ffmpeg($safe, $url);
    $restarted++;
    fwrite(STDOUT, date('c') . " watchdog restart safe={$safe}\n");
}

fwrite(STDOUT, date('c') . " packager-watchdog checked={$checked} restarted={$restarted}\n");
