<?php
declare(strict_types=1);

$tryPass = $argv[1] ?? '';

function loadEnv(string $path): array {
    $vars = [];
    if (!is_readable($path)) return $vars;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (!str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $vars[trim($k)] = trim($v, " \t\"'");
    }
    return $vars;
}

function smtpTry(string $user, string $pass, int $port): bool {
    require_once '/var/www/whmcs/vendor/phpmailer/phpmailer/src/PHPMailer.php';
    require_once '/var/www/whmcs/vendor/phpmailer/phpmailer/src/SMTP.php';
    require_once '/var/www/whmcs/vendor/phpmailer/phpmailer/src/Exception.php';

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->Port = $port;
    $mail->SMTPAuth = true;
    $mail->Username = $user;
    $mail->Password = $pass;
    $mail->SMTPSecure = $port === 465
        ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout = 15;
    $mail->setFrom($user, 'Nexlify');
    $mail->addAddress($user);
    $mail->Subject = 'WHMCS SMTP diagnostic';
    $mail->Body = 'diagnostic';

    try {
        $mail->send();
        return true;
    } catch (Throwable $e) {
        echo "port {$port}: {$e->getMessage()}\n";
        return false;
    }
}

$user = 'snookiebaby2022@gmail.com';
$env = loadEnv('/home/nexlify-panel/.env');
$appPass = $env['SMTP_PASS'] ?? '';

echo "Testing Gmail SMTP for {$user}\n";

if ($tryPass !== '') {
    echo "Trying provided password on 587/TLS...\n";
    if (smtpTry($user, $tryPass, 587)) {
        echo "RESULT: provided password works on 587/TLS\n";
        exit(0);
    }
    echo "Provided password failed on 587/TLS\n";
}

if ($appPass !== '') {
    echo "Trying panel .env app password on 587/TLS...\n";
    if (smtpTry($user, $appPass, 587)) {
        echo "RESULT: app password from panel .env works on 587/TLS\n";
        exit(0);
    }
}

echo "RESULT: no working password found — Gmail requires an App Password, not your normal login password.\n";
exit(1);
