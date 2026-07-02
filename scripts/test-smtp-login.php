<?php
declare(strict_types=1);

$host = 'smtp.gmail.com';
$port = (int) ($argv[1] ?? 587);
$user = $argv[2] ?? '';
$pass = $argv[3] ?? '';
$ssl = $port === 465 ? 'smtps' : 'tls';

if (!$user || !$pass) {
    fwrite(STDERR, "usage: php test-smtp-login.php [port] user pass\n");
    exit(1);
}

require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/PHPMailer.php';
require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/SMTP.php';
require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;

$mail = new PHPMailer(true);
$mail->SMTPDebug = 2;
$mail->Debugoutput = function ($str, $level) {
    echo trim($str) . PHP_EOL;
};
$mail->isSMTP();
$mail->Host = $host;
$mail->Port = $port;
$mail->SMTPAuth = true;
$mail->Username = $user;
$mail->Password = $pass;
$mail->SMTPSecure = $port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
$mail->setFrom($user, 'Nexlify Test');
$mail->addAddress($user);
$mail->Subject = 'SMTP auth test';
$mail->Body = 'test';

try {
    $mail->send();
    echo "OK sent via port {$port} ({$ssl})\n";
    exit(0);
} catch (Throwable $e) {
    echo "FAIL port {$port}: {$e->getMessage()}\n";
    exit(1);
}
