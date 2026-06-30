. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$cmd = "ps aux | grep -E 'next build|npm run build|deploy-vps' | grep -v grep; echo '---'; pm2 list | grep nexlify; echo '---'; tail -5 /home/nexlify-panel/.next/BUILD_ID 2>/dev/null || ls -la /home/nexlify-panel/.next 2>/dev/null | tail -3"
$a = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $a += "-i", $cfg.PrivateKey } else { $a += "-pw", $cfg.Password }
$a += $cmd
& $cfg.Plink @a
