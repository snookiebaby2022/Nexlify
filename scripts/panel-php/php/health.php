<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{cfg, pg_pdo, redis_client};

$pg = pg_pdo() !== null;
$redis = redis_client() !== null;
$ok = $pg;
http_response_code($ok ? 200 : 503);
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'ok' => $ok,
    'service' => 'panel-php',
    'postgres' => $pg,
    'redis' => $redis,
    'http_port' => cfg('STREAM_HTTP_PORT', '80'),
    'https_port' => cfg('STREAM_HTTPS_PORT', '443'),
], JSON_UNESCAPED_SLASHES);
