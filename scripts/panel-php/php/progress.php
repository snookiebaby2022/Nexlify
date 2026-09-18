<?php
declare(strict_types=1);

/**
 * XUI progress.php — VOD download / watch progress ACK.
 * Clients POST/GET progress; we accept and return success (no durable store required).
 */
require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{
    find_line_by_credentials,
    json_out
};

$username = (string) ($_REQUEST['username'] ?? $_REQUEST['user'] ?? '');
$password = (string) ($_REQUEST['password'] ?? $_REQUEST['pass'] ?? '');

if ($username !== '' && $password !== '') {
    $line = find_line_by_credentials($username, $password);
    if (!$line) {
        json_out(['result' => false, 'error' => 'Unauthorized'], 401);
    }
}

json_out([
    'result' => true,
    'success' => true,
    'progress' => isset($_REQUEST['progress']) ? (float) $_REQUEST['progress'] : null,
    'stream_id' => $_REQUEST['stream_id'] ?? $_REQUEST['stream'] ?? null,
]);
