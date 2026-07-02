# Fix v1.5.0 release note encoding on nexlify.live and rebuild nexlify-web
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$bash = (Get-Content -LiteralPath (Join-Path $PSScriptRoot "fix-website-1.5.0-notes.sh") -Raw) -replace "`r`n", "`n" -replace "`r", ""
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bash))

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "echo $b64 | base64 -d | bash"

& $cfg.Plink @plinkArgs
exit $LASTEXITCODE
