#!/bin/bash
set -euo pipefail
USER_EMAIL="$1"
SMTP_PASS="$2"
PORT="${3:-587}"

export SMTP_TEST_USER="$USER_EMAIL"
export SMTP_TEST_PASS="$SMTP_PASS"

php /home/nexlify-panel/scripts/test-smtp-login.php "$PORT" "$USER_EMAIL" "$SMTP_PASS" >/tmp/smtp-test.log 2>&1 || true
if grep -q '^OK sent' /tmp/smtp-test.log; then
  echo "SMTP auth OK on port $PORT"
else
  echo "SMTP auth FAILED on port $PORT"
  grep -E 'FAIL|SMTP Error|535|Could not|authenticate' /tmp/smtp-test.log | tail -5
  exit 1
fi

php -r '
require "/var/www/whmcs/init.php";
use WHMCS\Database\Capsule;
$ssl = (int)getenv("SMTP_PORT") === 465 ? "ssl" : "tls";
$port = (int)(getenv("SMTP_PORT") ?: 587);
$user = getenv("SMTP_TEST_USER");
$pass = getenv("SMTP_TEST_PASS");
$settings = [
  "MailType" => "smtp",
  "SMTPHost" => "smtp.gmail.com",
  "SMTPPort" => (string)$port,
  "SMTPUsername" => $user,
  "SMTPPassword" => $pass,
  "SMTPSSL" => $ssl,
  "SMTPSSLType" => $ssl,
  "DisableEmailSending" => "",
  "Email" => $user,
];
foreach ($settings as $k => $v) {
  $row = Capsule::table("tblconfiguration")->where("setting", $k)->first();
  if ($row) Capsule::table("tblconfiguration")->where("setting", $k)->update(["value" => $v]);
  else Capsule::table("tblconfiguration")->insert(["setting" => $k, "value" => $v]);
}
echo "WHMCS DB updated: port=$port ssl=$ssl\n";
' SMTP_PORT="$PORT"

rm -f /tmp/smtp-test.log
