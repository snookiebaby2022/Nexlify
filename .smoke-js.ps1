$html = Get-Content 'C:\Users\lizzi\nexlify-panel\.smoke-home.html' -Raw
$urls = [regex]::Matches($html, '/_next/static/[^"\s]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
Write-Output "JS_CHUNKS=$($urls.Count)"
$foundOpen = $false
$foundBanner = $false
foreach ($u in $urls) {
  $full = 'https://nexlify.live' + $u
  try {
    $js = (Invoke-WebRequest -Uri $full -UseBasicParsing).Content
    if ($js -match 'data-nx-offer-open') { $foundOpen = $true; Write-Output "OPEN_IN=$u" }
    if ($js -match 'data-nx-offer-banner') { $foundBanner = $true; Write-Output "BANNER_IN=$u" }
  } catch { Write-Output "FAIL=$u" }
}
Write-Output "BUNDLE_HAS_OPEN=$foundOpen"
Write-Output "BUNDLE_HAS_BANNER=$foundBanner"
