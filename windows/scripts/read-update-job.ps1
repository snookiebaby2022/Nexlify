. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$cmd = "cat /opt/nexlify-panel/.update-progress.json 2>/dev/null || echo no_job"
& $cfg.Plink -batch -ssh root@75.119.137.174 -pw CkfUCKD6blClbTegdE9jYoO0vB7fR $cmd
