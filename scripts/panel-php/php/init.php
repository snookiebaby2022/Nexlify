<?php
declare(strict_types=1);

/** XUI init.php — lightweight health/init for probes. */
require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{json_out, pg_pdo, redis_client};

$pg = pg_pdo() !== null;
$rd = redis_client() !== null;
json_out([
    'ok' => true,
    'init' => true,
    'postgres' => $pg,
    'redis' => $rd,
    'ts' => time(),
]);
