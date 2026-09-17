<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

use function Nexlify\ClassicLb\{json_out, cfg, list_connections};

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_PANEL_AGENT_TOKEN'] ?? '';
$token = cfg('AGENT_TOKEN');
$ok = false;
if ($token !== '') {
    if (is_string($auth) && preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
        $ok = hash_equals($token, $m[1]);
    } elseif (is_string($auth) && $auth !== '') {
        $ok = hash_equals($token, $auth);
    }
}
if (!$ok) {
    json_out(['ok' => false, 'error' => 'forbidden'], 403);
}

$stale = max(30, min(600, (int) ($_GET['stale'] ?? 90)));
json_out([
    'ok' => true,
    'handler' => \Nexlify\ClassicLb\connection_handler(),
    'connections' => list_connections($stale),
    'at' => gmdate('c'),
]);
