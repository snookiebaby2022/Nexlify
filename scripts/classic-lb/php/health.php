<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{json_out, cfg, mysql_pdo, redis_client, connection_handler};

$mysqlOk = mysql_pdo() !== null;
$redisOk = redis_client() !== null;
json_out([
    'ok' => true,
    'role' => 'classic-lb',
    'handler' => connection_handler(),
    'mysql' => $mysqlOk,
    'redis' => $redisOk,
    'mpegts' => 'php-remux',
    'serverId' => cfg('LB_SERVER_ID'),
    'ffmpeg' => is_executable(cfg('FFMPEG_BIN', '/usr/local/bin/ffmpeg'))
        || is_executable('/usr/bin/ffmpeg'),
    'php' => PHP_VERSION,
    'uptime' => (int) (@file_get_contents('/proc/uptime') ? (float) explode(' ', (string) file_get_contents('/proc/uptime'))[0] : 0),
]);
