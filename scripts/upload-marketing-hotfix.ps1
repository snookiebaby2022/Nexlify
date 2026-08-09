# Upload marketing hotfix only (18KB). Run on PC after git pull:
#   powershell -ExecutionPolicy Bypass -File scripts\upload-marketing-hotfix.ps1

& (Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\upload-vps-bundle.ps1")
