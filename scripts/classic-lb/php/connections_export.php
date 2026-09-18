<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{json_out, cfg, list_connections, prune_stale_connections};

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

$stale = max(60, min(3600, (int) ($_GET['stale'] ?? 300)));
$pruned = prune_stale_connections(max($stale, 600));
json_out([
    'ok' => true,
    'handler' => \Nexlify\ClassicLb\connection_handler(),
    'pruned' => $pruned,
    'connections' => list_connections($stale),
    'at' => gmdate('c'),
]);
