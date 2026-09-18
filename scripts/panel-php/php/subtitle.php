<?php
declare(strict_types=1);

/**
 * XC subtitle.php — return WebVTT when available, else empty cue sheet.
 * Query: username, password, stream / stream_id (optional episode)
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

header('Content-Type: text/vtt; charset=utf-8');
header('Cache-Control: private, max-age=60');

if ($username === '' || $password === '' || $rawId === '') {
    http_response_code(200);
    echo "WEBVTT\n\n";
    exit;
}

$line = find_line_by_credentials($username, $password);
if (!$line) {
    http_response_code(403);
    echo "WEBVTT\n\n";
    exit;
}

$streamId = resolve_stream_id($rawId, $username);
if ($streamId === null || !line_has_stream((string) $line['id'], $streamId)) {
    http_response_code(404);
    echo "WEBVTT\n\n";
    exit;
}

$stream = get_stream($streamId) ?? [];
// Optional future: Stream.customFields / notes may hold a subtitle URL.
$subUrl = '';
foreach (['subtitleUrl', 'subtitles', 'vttUrl'] as $k) {
    if (!empty($stream[$k]) && is_string($stream[$k]) && preg_match('#^https?://#i', $stream[$k])) {
        $subUrl = trim($stream[$k]);
        break;
    }
}

if ($subUrl !== '') {
    $ch = curl_init($subUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_USERAGENT => 'Nexlify-Subtitle/1.0',
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (is_string($body) && $body !== '' && $code >= 200 && $code < 400) {
        if (!str_starts_with(ltrim($body), 'WEBVTT')) {
            $body = "WEBVTT\n\n" . $body;
        }
        http_response_code(200);
        header('X-Nexlify: subtitle-upstream');
        echo $body;
        exit;
    }
}

http_response_code(200);
header('X-Nexlify: subtitle-empty');
echo "WEBVTT\n\n";
