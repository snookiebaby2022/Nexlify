# Deploy full marketing stack: SEO, ads, landings, growth toolkit
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$dropIn = Join-Path $root "marketing-drop-in"
$tarPath = Join-Path $env:TEMP "marketing-drop-in.tar.gz"

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
# Never ship build artifacts, secrets, local env, or production DB
tar -czf $tarPath `
  --exclude=.next `
  --exclude=node_modules `
  --exclude=src/generated `
  --exclude=data `
  --exclude=.env `
  --exclude=.env.local `
  --exclude=.env.production `
  -C $dropIn .

$patchPy = Join-Path $root "scripts\patch-marketing-full.py"
$deploySh = Join-Path $root "scripts\marketing-deploy-vps.sh"
$smokeSh = Join-Path $root "scripts\marketing-smoke-test.sh"
$syncAdmin = Join-Path $root "scripts\sync-marketing-admin.cjs"
$verifyAdmin = Join-Path $root "scripts\verify-admin-login.cjs"
$syncEnv = Join-Path $root "scripts\sync-marketing-env.py"

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "rm -rf /tmp/marketing-full-drop-in && mkdir -p /tmp/marketing-full-drop-in"
& $cfg.Plink @plinkPre

$winscp = @"
option batch on
option confirm off
$openLine
put "$patchPy" /tmp/patch-marketing-full.py
put "$deploySh" /tmp/marketing-deploy-vps.sh
put "$smokeSh" /tmp/marketing-smoke-test.sh
put "$syncAdmin" /tmp/sync-marketing-admin.cjs
put "$verifyAdmin" /tmp/verify-admin-login.cjs
put "$syncEnv" /tmp/sync-marketing-env.py
put "$tarPath" /tmp/marketing-drop-in.tar.gz
exit
"@
$f = Join-Path $env:TEMP "deploy-marketing-full.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue
Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

$remote = @(
  "tar -xzf /tmp/marketing-drop-in.tar.gz -C /tmp/marketing-full-drop-in",
  "python3 /tmp/patch-marketing-full.py",
  "mkdir -p /var/www/nexlify/scripts",
  "cp /tmp/marketing-deploy-vps.sh /tmp/marketing-smoke-test.sh /tmp/sync-marketing-admin.cjs /tmp/verify-admin-login.cjs /tmp/sync-marketing-env.py /var/www/nexlify/scripts/",
  "perl -pi -e 's/\r\n/\n/g; s/\r/\n/g' /var/www/nexlify/scripts/marketing-deploy-vps.sh /var/www/nexlify/scripts/marketing-smoke-test.sh",
  "chmod +x /var/www/nexlify/scripts/marketing-deploy-vps.sh /var/www/nexlify/scripts/marketing-smoke-test.sh",
  "bash /var/www/nexlify/scripts/marketing-deploy-vps.sh"
) -join " && "

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote
& $cfg.Plink @plink
if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy FAILED - site was not restarted (smoke tests or build failed)." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Syncing growth toolkit CSS (no rebuild)..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "deploy-marketing-growth-toolkit.ps1")
exit $LASTEXITCODE
