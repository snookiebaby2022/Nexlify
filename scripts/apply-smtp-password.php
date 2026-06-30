<?php
declare(strict_types=1);

$pass = $argv[1] ?? '';
$user = 'snookiebaby2022@gmail.com';
$host = 'smtp.gmail.com';
$port = 587;

if ($pass === '') {
    fwrite(STDERR, "usage: php apply-smtp-password.php <app-password>\n");
    exit(1);
}

// Normalize: Gmail app passwords work with or without spaces
$passNorm = str_replace(' ', '', $pass);

function patchEnv(string $path, string $pass): void {
    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        throw new RuntimeException("Cannot read {$path}");
    }
    $out = [];
    $done = false;
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), 'SMTP_PASS=')) {
            $out[] = 'SMTP_PASS="' . $pass . '"';
            $done = true;
        } else {
            $out[] = $line;
        }
    }
    if (!$done) {
        $out[] = 'SMTP_PASS="' . $pass . '"';
    }
    file_put_contents($path, implode("\n", $out) . "\n");
}

patchEnv('/home/nexlify-panel/.env', $pass);

require '/var/www/whmcs/init.php';
use WHMCS\Database\Capsule;

foreach ([
    'MailType' => 'smtp',
    'SMTPHost' => $host,
    'SMTPPort' => (string) $port,
    'SMTPUsername' => $user,
    'SMTPPassword' => $passNorm,
    'SMTPSSL' => 'tls',
    'SMTPSSLType' => 'tls',
    'DisableEmailSending' => '',
    'Email' => $user,
] as $key => $value) {
    $row = Capsule::table('tblconfiguration')->where('setting', $key)->first();
    if ($row) {
        Capsule::table('tblconfiguration')->where('setting', $key)->update(['value' => $value]);
    } else {
        Capsule::table('tblconfiguration')->insert(['setting' => $key, 'value' => $value]);
    }
}

require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/PHPMailer.php';
require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/SMTP.php';
require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;

$mail = new PHPMailer(true);
$mail->isSMTP();
$mail->Host = $host;
$mail->Port = $port;
$mail->SMTPAuth = true;
$mail->Username = $user;
$mail->Password = $passNorm;
$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
$mail->setFrom($user, 'Nexlify Billing');
$mail->addAddress($user);
$mail->Subject = 'SMTP password updated — ' . gmdate('Y-m-d H:i:s') . ' UTC';
$mail->Body = 'Your new Gmail app password is configured for WHMCS and the panel.';

$mail->send();
echo "OK: panel .env + WHMCS updated, test email sent to {$user}\n";
