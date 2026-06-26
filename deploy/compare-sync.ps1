$files = @(
  @{ Name = "panel-sidebar.tsx"; Sb = "deploy\panel-patches\panel-sidebar.tsx"; Np = @("src\components\panel-sidebar.tsx") },
  @{ Name = "panel-transfer-export.ts"; Sb = "deploy\panel-patches\panel-transfer-export.ts"; Np = @("src\lib\panel-transfer-export.ts") },
  @{ Name = "panel-transfer-import.ts"; Sb = "deploy\panel-patches\panel-transfer-import.ts"; Np = @("src\lib\panel-transfer-import.ts") },
  @{ Name = "panel-migration-map-rows.ts"; Sb = "deploy\panel-patches\panel-migration-map-rows.ts"; Np = @("src\lib\panel-migration\map-rows.ts") },
  @{ Name = "provider-url-bulk.ts"; Sb = "deploy\panel-patches\provider-url-bulk.ts"; Np = @("src\lib\provider-url-bulk.ts") }
)

function HashOrMissing($path) {
  if (Test-Path $path) { return (Get-FileHash $path -Algorithm MD5).Hash }
  return "MISSING"
}

$root = "C:\Users\lizzi\Projects\stream-billing"
$panel = "C:\Users\lizzi\nexlify-panel"

Write-Output "FILE | stream-billing-patch | local-nexlify-panel"
foreach ($f in $files) {
  $sbPath = Join-Path $root $f.Sb
  $sbHash = HashOrMissing $sbPath
  $npHash = "MISSING"
  foreach ($rel in $f.Np) {
    $p = Join-Path $panel $rel
    if (Test-Path $p) { $npHash = HashOrMissing $p; break }
  }
  $match = if ($sbHash -eq $npHash -and $sbHash -ne "MISSING") { "MATCH" } else { "DIFF" }
  Write-Output "$($f.Name) | $sbHash | $npHash | $match"
}
