<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'ok' => true,
    'service' => 'nexlify-panel-php',
    'ts' => time(),
], JSON_UNESCAPED_SLASHES);
