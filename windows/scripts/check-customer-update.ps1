param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "cat /opt/nexlify-panel/.update-progress.json 2>/dev/null; echo '---'; curl -sS -o /dev/null -w 'health:%{http_code} login:%{http_code}' http://127.0.0.1/api/health http://127.0.0.1/login 2>/dev/null; echo"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
& $cfg.Plink @plinkArgs
