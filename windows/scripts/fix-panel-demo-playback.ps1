$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remotePanel = if ($cfg.RemotePath) { $cfg.RemotePath } else { "/home/nexlify-panel" }

$localEnsure = Join-Path $cfg.ProjectRoot "scripts\ensure-panel-env.sh"
$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}
$winscp = @"
option batch on
option confirm off
$openLine
put "$localEnsure" $remotePanel/scripts/ensure-panel-env.sh
exit
"@
$f = Join-Path $env:TEMP "fix-demo-env.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remote = "cd $remotePanel && sed -i 's/\r$//' scripts/ensure-panel-env.sh && bash scripts/ensure-panel-env.sh && grep '^PANEL_DEMO_HOSTS=' .env && pm2 restart nexlify --update-env && sleep 5 && curl -sS 'http://127.0.0.1:13000/player_api.php?username=bad&password=bad&action=get_live_categories'"

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote
& $cfg.Plink @plink

try {
  $r = Invoke-WebRequest -Uri "https://panel.nexlify.live/player_api.php?username=bad&password=bad&action=get_live_categories" -Headers @{ Origin = "https://nexlify.live" } -UseBasicParsing -TimeoutSec 20
  Write-Host "OK public: $($r.StatusCode) CORS=$($r.Headers['Access-Control-Allow-Origin'])"
} catch {
  $resp = $_.Exception.Response
  if ($resp) {
    Write-Host "Public: $([int]$resp.StatusCode) CORS=$($resp.Headers['Access-Control-Allow-Origin'])"
    $sr = [System.IO.StreamReader]::new($resp.GetResponseStream())
    Write-Host $sr.ReadToEnd()
  }
}
