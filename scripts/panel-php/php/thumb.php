<?php
declare(strict_types=1);

/**
 * XC thumb.php — redirect/proxy channel or VOD artwork (streamIcon).
 * Query: username, password, stream / stream_id
 */
require __DIR__ . '/lib.php';

use function Nexlify\PanelPhp\{
    find_line_by_credentials,
    resolve_stream_id,
    line_has_stream,
    get_stream
};

$username = (string) ($_GET['username'] ?? $_GET['user'] ?? '');
$password = (string) ($_GET['password'] ?? $_GET['pass'] ?? '');
$rawId = (string) ($_GET['stream'] ?? $_GET['stream_id'] ?? $_GET['id'] ?? '');

if ($username === '' || $password === '' || $rawId === '') {
    http_response_code(400);
    header('X-Nexlify: thumb-bad-request');
    exit;
}

$line = find_line_by_credentials($username, $password);
if (!$line) {
    http_response_code(403);
    header('X-Nexlify: thumb-denied');
    exit;
}

$streamId = resolve_stream_id($rawId, $username);
if ($streamId === null || !line_has_stream((string) $line['id'], $streamId)) {
    http_response_code(404);
    header('X-Nexlify: thumb-missing');
    exit;
}

$stream = get_stream($streamId);
$icon = trim((string) ($stream['streamIcon'] ?? ''));
if ($icon === '' || !preg_match('#^https?://#i', $icon)) {
    http_response_code(204);
    header('X-Nexlify: thumb-empty');
    exit;
}

// Prefer 302 so clients/CDN fetch artwork directly (no panel bandwidth).
header('Cache-Control: public, max-age=300');
header('X-Nexlify: thumb-redirect');
header('Location: ' . $icon);
http_response_code(302);
exit;
