# One-time: allow passwordless deploy from this PC to the VPS
param(
  [string]$VpsHost = "85.17.162.54",
  [string]$User = "root"
)

$ErrorActionPreference = "Stop"
$KeyDir = "$env:USERPROFILE\.ssh"
$KeyPath = "$KeyDir\id_ed25519"
$PubPath = "$KeyPath.pub"
$sshTarget = $User + "@" + $VpsHost

if (-not (Test-Path $KeyDir)) {
  New-Item -ItemType Directory -Path $KeyDir -Force | Out-Null
}

if (-not (Test-Path $KeyPath)) {
  Write-Host ("Creating SSH key at " + $KeyPath + " ...")
  ssh-keygen -t ed25519 -f $KeyPath -N '""' -q
} else {
  Write-Host ("Using existing key: " + $KeyPath)
}

Write-Host ""
Write-Host "========== YOUR PUBLIC KEY (copy one line) =========="
Get-Content $PubPath
Write-Host "===================================================="
Write-Host ""

$remoteKeyCmd = "mkdir -p ~/.ssh; chmod 700 ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"

Write-Host "Option A - Run now (enter VPS root password when asked):"
Write-Host ""

$doCopy = Read-Host "Run Option A now? (y/n)"
if ($doCopy -eq "y" -or $doCopy -eq "Y") {
  Get-Content $PubPath | ssh $sshTarget $remoteKeyCmd
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Testing key login..."
    ssh -o BatchMode=yes $sshTarget "echo SSH key login OK"
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Success. Now run: npm run deploy"
    }
  }
} else {
  Write-Host ""
  Write-Host "Option B - VPS web console:"
  Write-Host "  1. Log in via browser console"
  Write-Host "  2. mkdir -p ~/.ssh; chmod 700 ~/.ssh"
  Write-Host "  3. nano ~/.ssh/authorized_keys"
  Write-Host "  4. Paste public key above; chmod 600 ~/.ssh/authorized_keys"
  Write-Host "  5. On Windows: npm run deploy"
}
