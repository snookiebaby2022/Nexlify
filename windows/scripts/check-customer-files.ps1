. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
& $cfg.Plink -batch -ssh root@75.119.137.174 -pw CkfUCKD6blClbTegdE9jYoO0vB7fR "grep -c BUILTIN_ADDONS /opt/nexlify-panel/src/app/admin/addons/page.tsx 2>/dev/null || echo 0; grep -c builtin-addons-catalog /opt/nexlify-panel/src/app/admin/addons/page.tsx 2>/dev/null || echo 0; grep -c 'pm2 stop nexlify' /opt/nexlify-panel/scripts/apply-panel-fast-update.sh 2>/dev/null || echo 0"
