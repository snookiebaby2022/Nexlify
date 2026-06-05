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
