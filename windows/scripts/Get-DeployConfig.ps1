function ConvertFrom-DeployConfigJson {
  param([string]$Raw)
  try {
    return $Raw | ConvertFrom-Json
  } catch {
    # Windows paths like C:\Users\... must use forward slashes or doubled backslashes in JSON
    $repaired = [regex]::Replace(
      $Raw,
      '("(?:privateKey|winscpPath|plinkPath)"\s*:\s*")([^"]*)(")',
      {
        $path = $_.Groups[2].Value -replace '\\', '/'
        $_.Groups[1].Value + $path + $_.Groups[3].Value
      }
    )
    try {
      return $repaired | ConvertFrom-Json
    } catch {
      throw @"
deploy.config.json is invalid JSON (often caused by backslashes in privateKey).

Use forward slashes, for example:
  "privateKey": "C:/Users/lizzi/Documents/.ssh/nexlify.ppk"

Or escape each backslash twice:
  "privateKey": "C:\\Users\\lizzi\\Documents\\.ssh\\nexlify.ppk"

Original error: $($_.Exception.Message)
"@
    }
  }
}

function Find-DeployTool {
  param([string[]]$Candidates)
  foreach ($p in $Candidates) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  return $null
}

function Get-NexlifyDeployConfig {
  $windowsDir = Split-Path -Parent $PSScriptRoot
  $projectRoot = Split-Path -Parent $windowsDir
  $configPath = Join-Path $windowsDir "deploy.config.json"

  if (-not (Test-Path -LiteralPath $configPath)) {
    throw @"
deploy.config.json not found.

In the windows folder:
  Copy-Item deploy.config.example.json deploy.config.json
  notepad deploy.config.json

Path: $configPath
"@
  }

  $raw = Get-Content -LiteralPath $configPath -Raw
  $cfg = ConvertFrom-DeployConfigJson -Raw $raw

  $winscp = if ($cfg.winscpPath) { $cfg.winscpPath } else {
    Find-DeployTool @(
      "${env:ProgramFiles}\WinSCP\WinSCP.com"
      "${env:ProgramFiles(x86)}\WinSCP\WinSCP.com"
      "${env:LocalAppData}\Programs\WinSCP\WinSCP.com"
    )
  }

  $plink = if ($cfg.plinkPath) { $cfg.plinkPath } else {
    Find-DeployTool @(
      "${env:ProgramFiles}\PuTTY\plink.exe"
      "${env:ProgramFiles(x86)}\PuTTY\plink.exe"
    )
  }

  if (-not $winscp) {
    throw "WinSCP.com not found. Install WinSCP or set winscpPath in windows/deploy.config.json"
  }
  if (-not $plink) {
    throw "plink.exe not found. Install PuTTY or set plinkPath in windows/deploy.config.json"
  }

  if (-not $cfg.host -or $cfg.host -eq "YOUR_SERVER_IP") {
    throw "Set host in windows/deploy.config.json"
  }
  if (-not $cfg.username) {
    throw "Set username in windows/deploy.config.json"
  }
  if (-not $cfg.remotePath) {
    $cfg | Add-Member -NotePropertyName remotePath -NotePropertyValue "/home/nexlify-panel" -Force
  }

  $useKey = $cfg.privateKey -and (Test-Path -LiteralPath $cfg.privateKey)
  if (-not $useKey -and -not $cfg.password) {
    throw "Set privateKey (.ppk) or password in windows/deploy.config.json"
  }

  [PSCustomObject]@{
    ProjectRoot   = $projectRoot
    WindowsDir    = $windowsDir
    Host          = [string]$cfg.host
    Port          = if ($cfg.port) { [int]$cfg.port } else { 22 }
    Username      = [string]$cfg.username
    RemotePath    = [string]$cfg.remotePath
    PrivateKey    = if ($useKey) { [string]$cfg.privateKey } else { $null }
    Password      = if ($cfg.password) { [string]$cfg.password } else { $null }
    WinScp        = $winscp
    Plink         = $plink
    AcceptHostKey = [bool]($cfg.acceptHostKey -ne $false)
    SyncOnly      = [bool]$cfg.syncOnly
  }
}

# WinSCP filemask: pipe prefix = exclude from sync/compare (keeps deploy fast).
function Get-NexlifyDeployFilemask {
  @(
    "node_modules/"
    ".next/"
    ".next.staging/"
    ".next.backup/"
    ".next.test/"
    ".next.old/"
    ".git/"
    ".env"
    "*.db"
    "dist/"
    "windows/"
    ".license-keys/"
    "marketing-drop-in/"
    "promo-for-nexlify-web/"
    ".opencode/"
    ".cursor/"
    ".claude/"
    "docs/"
    "agent-transcripts/"
    "graft/"
    "tmp/"
    "backups/"
    ".vscode/"
    "assets/"
    "license-server/"
    "*.tar"
    "*.tar.gz"
    "*.zip"
    "*.sql.gz"
    "src/instrumentation.ts"
    "src/lib/cron-scheduler.ts"
    "tsconfig.tsbuildinfo"
    ".update-progress.json"
    ".update-progress.pid"
  ) -join ";"
}

function Get-NexlifyOpenSshKey {
  param([string]$Preferred)
  foreach ($candidate in @($Preferred, "$env:USERPROFILE\.ssh\nexlify_deploy", "$env:USERPROFILE\.ssh\id_ed25519")) {
    if ($candidate -and (Test-Path -LiteralPath $candidate) -and $candidate -notlike "*.ppk") {
      return $candidate
    }
  }
  return $null
}

function Sync-NexlifyPanelToRemote {
  param(
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][string]$RemotePath,
    [Parameter(Mandatory)][string]$ProjectRoot,
    [string]$Password = "",
    [string]$PrivateKey = $null,
    [Parameter(Mandatory)][string]$WinScp,
    [int]$Port = 22,
    [string]$Username = "root",
    [switch]$AcceptHostKey
  )

  $sshKey = if ($Password) { $null } else { Get-NexlifyOpenSshKey -Preferred $PrivateKey }
  if ($sshKey) {
    Write-Host "Sync via OpenSSH tar stream (fast) -> ${Username}@${HostName}:${RemotePath} ..."
    $excludes = @(
      "--exclude=node_modules"
      "--exclude=.next"
      "--exclude=.next.staging"
      "--exclude=.next.backup"
      "--exclude=.next.test"
      "--exclude=.next.old"
      "--exclude=.git"
      "--exclude=windows"
      "--exclude=graft"
      "--exclude=marketing-drop-in"
      "--exclude=.opencode"
      "--exclude=.cursor"
      "--exclude=.claude"
      "--exclude=agent-transcripts"
      "--exclude=tmp"
      "--exclude=backups"
      "--exclude=.vscode"
      "--exclude=assets"
    )
    Push-Location $ProjectRoot
    try {
      $sshTarget = "${Username}@${HostName}"
      $sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-p", "$Port", "-i", $sshKey)
      $sedFix = 'sed -i ''s/\r$//'' scripts/*.sh scripts/*.mjs 2>/dev/null || true'
      $remote = "mkdir -p '$RemotePath' && cd '$RemotePath' && tar -xzf - && rm -f src/instrumentation.ts src/lib/cron-scheduler.ts && $sedFix"
      & tar -czf - @excludes . | & ssh.exe @sshOpts $sshTarget $remote
      if ($LASTEXITCODE -eq 0) {
        Write-Host "OpenSSH sync complete."
        return
      }
      Write-Host "OpenSSH sync failed ($LASTEXITCODE) - falling back to WinSCP..." -ForegroundColor Yellow
    } finally {
      Pop-Location
    }
  }

  $hostKeyOpt = if ($AcceptHostKey) { ' -hostkey="*"' } else { "" }
  $filemask = Get-NexlifyDeployFilemask
  # Sync code dirs one at a time — avoids WinSCP "Comparing..." walking .next / license-server on the VPS.
  $syncDirs = @("scripts", "src", "prisma", "public")
  $rootFiles = @(
    "package.json", "package-lock.json", "next.config.ts", "tsconfig.json",
    "ecosystem.config.cjs", "middleware.ts", "postcss.config.mjs", "tailwind.config.ts"
  )
  $winscpLines = @(
    "option batch continue",
    "option confirm off",
    "option transfer binary",
    "open sftp://${Username}:${Password}@${HostName}:${Port}/$hostKeyOpt"
  )
  foreach ($dir in $syncDirs) {
    $localDir = Join-Path $ProjectRoot $dir
    if (-not (Test-Path -LiteralPath $localDir)) { continue }
    $winscpLines += @(
      "lcd `"$localDir`"",
      "cd `"$RemotePath/$dir`"",
      "synchronize remote -delete=none -criteria=time -filemask=`"|$filemask`""
    )
  }
  $winscpLines += @(
    "lcd `"$ProjectRoot`"",
    "cd `"$RemotePath`""
  )
  foreach ($f in $rootFiles) {
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot $f)) {
      $winscpLines += "put `"$f`""
    }
  }
  $winscpLines += @(
    "call rm -f src/instrumentation.ts src/lib/cron-scheduler.ts",
    'call sed -i ''s/\r$//'' scripts/*.sh scripts/*.mjs 2>/dev/null || true',
    "exit"
  )
  $winscpScript = $winscpLines -join "`n"
  $scriptFile = Join-Path $env:TEMP "nexlify-customer-sync.txt"
  Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
  Write-Host "Sync via WinSCP -> ${Username}@${HostName}:${RemotePath} ..."
  & $WinScp "/ini=nul" "/batch" "/script=$scriptFile"
  Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { throw "WinSCP sync failed ($LASTEXITCODE)" }
}
