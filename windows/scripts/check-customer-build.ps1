. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$cmd = "ps aux | grep -E 'next build|panel-update-background' | grep -v grep | head -5; echo ---; cat /opt/nexlify-panel/.update-progress.json 2>/dev/null | grep -E 'status|currentStep|message|finishedAt' | head -6"
& $cfg.Plink -batch -ssh root@75.119.137.174 -pw CkfUCKD6blClbTegdE9jYoO0vB7fR $cmd
