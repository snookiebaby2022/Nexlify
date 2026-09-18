<?php
declare(strict_types=1);

namespace Nexlify\PanelPhp;

/** Proxy current request to Next.js on :13000 (same path or override). */
function proxy_to_next(?string $pathOverride = null, int $timeout = 120): never
{
    $path = $pathOverride ?? (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $qs = $_SERVER['QUERY_STRING'] ?? '';
    $target = 'http://127.0.0.1:13000' . $path;
    if ($qs !== '') {
        $target .= '?' . $qs;
    }

    $headers = [];
    foreach (['HTTP_USER_AGENT', 'HTTP_ACCEPT', 'HTTP_ACCEPT_LANGUAGE', 'HTTP_COOKIE', 'HTTP_AUTHORIZATION'] as $h) {
        if (!empty($_SERVER[$h])) {
            $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($h, 5)))));
            $headers[] = $name . ': ' . $_SERVER[$h];
        }
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $headers[] = 'X-Forwarded-For: ' . $_SERVER['HTTP_X_FORWARDED_FOR'];
    }
    if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $headers[] = 'X-Real-Ip: ' . $_SERVER['HTTP_X_REAL_IP'];
    }
    $headers[] = 'X-Forwarded-Proto: ' . ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? 'http');
    $headers[] = 'X-Forwarded-Host: ' . ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost'));

    $ch = curl_init($target);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CUSTOMREQUEST => $_SERVER['REQUEST_METHOD'] ?? 'GET',
    ];
    if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH'], true)) {
        $opts[CURLOPT_POSTFIELDS] = file_get_contents('php://input') ?: '';
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    if ($raw === false) {
        http_response_code(502);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Bad gateway';
        exit;
    }

    $hdrBlock = substr($raw, 0, $headerSize);
    $body = substr($raw, $headerSize);
    foreach (explode("\r\n", $hdrBlock) as $line) {
        if ($line === '' || str_starts_with(strtolower($line), 'http/')) {
            continue;
        }
        if (stripos($line, 'Transfer-Encoding:') === 0) {
            continue;
        }
        if (stripos($line, 'Connection:') === 0) {
            continue;
        }
        header($line, false);
    }
    http_response_code($code > 0 ? $code : 502);
    echo $body;
    exit;
}
