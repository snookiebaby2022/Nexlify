param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = @'
tmp=$(mktemp -d /tmp/nexlify-diag-XXXXXX)
curl -fsSL "https://nexlify.live/downloads/nexlify-panel.tar.gz?v=171" -o "$tmp/panel.tar.gz"
echo "size=$(wc -c < "$tmp/panel.tar.gz" | tr -d " ")"
echo "=== tar head ==="
tar -tzf "$tmp/panel.tar.gz" | head -5
echo "=== grep package.json ==="
tar -tzf "$tmp/panel.tar.gz" 2>/dev/null | grep -E '(^|/)package\.json$' && echo GREP_OK || echo GREP_FAIL
echo "=== package.json version ==="
tar -xOf "$tmp/panel.tar.gz" ./package.json 2>/dev/null | grep '"version"' | head -1
rm -rf "$tmp"
'@
& $cfg.Plink -batch -ssh "root@$CustomerHost" -pw $CustomerPassword $remoteCmd
