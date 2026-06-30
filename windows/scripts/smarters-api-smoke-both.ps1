$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$CustomerHost = "75.119.137.174"
$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
$localSh = Join-Path $cfg.ProjectRoot "scripts\smarters-api-smoke.sh"
$ensureLine = Join-Path $cfg.ProjectRoot "scripts\ensure-smoke-test-line.cjs"

function Run-Smoke($label, $hostSpec, $password, $panelPath, $useVendorAuth) {
  Write-Host "`n--- Smarters test: $label ---" -ForegroundColor Yellow
  if ($useVendorAuth) {
    $open = if ($cfg.PrivateKey) {
      "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/ -hostkey=`"*`" -privatekey=`"$($cfg.PrivateKey)`""
    } else {
      "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/ -hostkey=`"*`""
    }
    $plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
    if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
  } else {
    $open = "open sftp://root:$password@${hostSpec}:22/ -hostkey=`"*`""
    $plinkArgs = @("-batch", "-ssh", "root@$hostSpec", "-pw", $password)
  }
  $winscp = @"
option batch on
option confirm off
$open
put "$localSh" /tmp/smarters-api-smoke.sh
put "$ensureLine" /tmp/ensure-smoke-test-line.cjs
exit
"@
  $f = Join-Path $env:TEMP "smoke-$label.txt"
  Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
  & $cfg.WinScp "/ini=nul" "/script=$f" | Out-Null
  $plinkArgs += "sed -i 's/\r$//' /tmp/smarters-api-smoke.sh && chmod +x /tmp/smarters-api-smoke.sh && cp /tmp/ensure-smoke-test-line.cjs $panelPath/scripts/ensure-smoke-test-line.cjs 2>/dev/null || mkdir -p $panelPath/scripts && cp /tmp/ensure-smoke-test-line.cjs $panelPath/scripts/ensure-smoke-test-line.cjs && PANEL_DIR=$panelPath bash /tmp/smarters-api-smoke.sh"
  & $cfg.Plink @plinkArgs
}

Run-Smoke -label "VENDOR" -hostSpec $cfg.Host -password $null -panelPath $cfg.RemotePath -useVendorAuth $true
Run-Smoke -label "CUSTOMER" -hostSpec $CustomerHost -password $CustomerPassword -panelPath "/opt/nexlify-panel" -useVendorAuth $false
