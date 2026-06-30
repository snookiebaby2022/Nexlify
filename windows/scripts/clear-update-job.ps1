. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "rm -f /opt/nexlify-panel/.update-progress.json /opt/nexlify-panel/.update-progress.pid && echo CLEARED"
& $cfg.Plink -batch -ssh root@75.119.137.174 -pw CkfUCKD6blClbTegdE9jYoO0vB7fR $remoteCmd
