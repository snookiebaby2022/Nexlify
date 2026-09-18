<?php
declare(strict_types=1);

/**
 * Public enigma2.php — proxy to Next :13000 (keeps full XML catalog logic).
 * Nginx serves this via panel-php FPM so the hot path is off the Next worker pool.
 */
$target = 'http://127.0.0.1:13000/enigma2.php';
$qs = $_SERVER['QUERY_STRING'] ?? '';
if ($qs !== '') {
    $target .= '?' . $qs;
}

$headers = [];
foreach (['HTTP_USER_AGENT', 'HTTP_ACCEPT', 'HTTP_ACCEPT_LANGUAGE', 'HTTP_COOKIE'] as $h) {
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
    CURLOPT_TIMEOUT => 60,
    CURLOPT_CUSTOMREQUEST => $_SERVER['REQUEST_METHOD'] ?? 'GET',
];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $opts[CURLOPT_POSTFIELDS] = file_get_contents('php://input') ?: '';
}
curl_setopt_array($ch, $opts);
$raw = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

if ($raw === false) {
    http_response_code(502);
    header('Content-Type: application/xml; charset=utf-8');
    echo '<?xml version="1.0"?><items></items>';
    exit;
}

$hdrBlock = substr($raw, 0, $headerSize);
$body = substr($raw, $headerSize);
foreach (explode("\r\n", $hdrBlock) as $line) {
    if (stripos($line, 'Content-Type:') === 0 || stripos($line, 'Cache-Control:') === 0) {
        header($line, false);
    }
}
http_response_code($code > 0 ? $code : 502);
echo $body;
