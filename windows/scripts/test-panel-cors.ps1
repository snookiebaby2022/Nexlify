$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$rp = if ($cfg.RemotePath) { $cfg.RemotePath } else { "/home/nexlify-panel" }
$local = Join-Path $cfg.ProjectRoot "scripts\test-player-api.sh"
$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}
$winscp = "option batch on`noption confirm off`n$openLine`nput `"$local`" $rp/scripts/test-player-api.sh`nexit"
$f = Join-Path $env:TEMP "tpa.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "sed -i 's/\r$//' $rp/scripts/test-player-api.sh && bash $rp/scripts/test-player-api.sh"
& $cfg.Plink @plink
