. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = @'
OUT=/home/nexlify-panel/dist/nexlify-panel.tar.gz
TAR_LIST="$(tar -tzf "$OUT")"
for f in .env.example scripts/apply-panel-fast-update.sh; do
  if echo "$TAR_LIST" | grep -qF "${f}"; then echo "OK $f"; else echo "MISS $f"; fi
done
'@
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
& $cfg.Plink @plinkArgs
