param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh && bash scripts/pm2-start.sh && sleep 3 && pm2 list && curl -sS -o /dev/null -w 'health:%{http_code}' http://127.0.0.1/api/health && echo && curl -sS -o /dev/null -w 'login:%{http_code}' http://127.0.0.1/login && echo"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
& $cfg.Plink @plinkArgs
