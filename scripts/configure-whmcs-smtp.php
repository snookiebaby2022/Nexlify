<?php
/**
 * Configure WHMCS SMTP from panel .env and send a test message.
 * Run on VPS: php /home/nexlify-panel/scripts/configure-whmcs-smtp.php [to-email]
 */
declare(strict_types=1);

$to = $argv[1] ?? null;

function loadEnv(string $path): array {
    if (!is_readable($path)) {
        throw new RuntimeException("Missing env file: {$path}");
    }
    $vars = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (!str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $vars[trim($k)] = trim($v, " \t\"'");
    }
    return $vars;
}

$env = loadEnv('/home/nexlify-panel/.env');
$host = $env['SMTP_HOST'] ?? '';
$user = $env['SMTP_USER'] ?? '';
$pass = $env['SMTP_PASS'] ?? '';
$port = (int) ($env['SMTP_PORT'] ?? 587);
$from = $env['SMTP_FROM'] ?? $user;
$to = $to ?: ($env['PANEL_REPORT_EMAIL'] ?? $user);

if (!$host || !$user || !$pass) {
    fwrite(STDERR, "SMTP_HOST, SMTP_USER, and SMTP_PASS required in panel .env\n");
    exit(1);
}

require '/var/www/whmcs/init.php';

use WHMCS\Database\Capsule;

$sslType = $port === 465 ? 'ssl' : 'tls';
$settings = [
    'MailType' => 'smtp',
    'SMTPHost' => $host,
    'SMTPPort' => (string) $port,
    'SMTPUsername' => $user,
    'SMTPPassword' => $pass,
    'SMTPSSL' => $sslType,
    'SMTPSSLType' => $sslType,
    'DisableEmailSending' => '',
    'Email' => preg_match('/<([^>]+)>/', $from, $m) ? $m[1] : $user,
];

foreach ($settings as $key => $value) {
    $row = Capsule::table('tblconfiguration')->where('setting', $key)->first();
    if ($row) {
        Capsule::table('tblconfiguration')->where('setting', $key)->update(['value' => $value]);
    } else {
        Capsule::table('tblconfiguration')->insert(['setting' => $key, 'value' => $value]);
    }
}

echo "WHMCS SMTP configured (host={$host}, port={$port}, user={$user})\n";

require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/PHPMailer.php';
require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/SMTP.php';
require '/var/www/whmcs/vendor/phpmailer/phpmailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;

$fromEmail = preg_match('/<([^>]+)>/', $from, $m) ? $m[1] : $user;
$fromName = preg_match('/^([^<]+)</', $from, $n) ? trim($n[1]) : 'Nexlify Billing';

$mail = new PHPMailer(true);
$mail->isSMTP();
$mail->Host = $host;
$mail->Port = $port;
$mail->SMTPAuth = true;
$mail->Username = $user;
$mail->Password = $pass;
$mail->SMTPSecure = $port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
$mail->setFrom($fromEmail, $fromName);
$mail->addAddress($to, 'Nexlify Test');
$mail->Subject = 'WHMCS SMTP test — ' . gmdate('Y-m-d H:i:s') . ' UTC';
$mail->Body =
    "This is a test email from Nexlify WHMCS after SMTP configuration.\n\n" .
    "If you received this, billing emails (invoices, password resets) should work.\n\n" .
    "Check WHMCS → System Settings → Automation Status after the next cron run.";

try {
    $mail->send();
    echo "Test email sent to {$to}\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Test email failed: {$e->getMessage()}\n");
    exit(1);
}

echo "Running WHMCS cron to verify mail queue...\n";
passthru('/usr/bin/php -q /var/www/whmcs_private/crons/cron.php 2>&1', $cronExit);
echo $cronExit === 0 ? "WHMCS cron ok\n" : "WHMCS cron exit {$cronExit}\n";
exit(0);
