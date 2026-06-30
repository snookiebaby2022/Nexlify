$html = Get-Content 'C:\Users\lizzi\nexlify-panel\.smoke-home.html' -Raw
$hasBanner = $html.Contains('data-nx-offer-banner')
$hasOpen = $html.Contains('data-nx-offer-open')
$bannerOrNoOpen = $hasBanner -or (-not $hasOpen)
$modalSignals = @{
  'data-nx-offer-open' = $html.Contains('data-nx-offer-open')
  'role="dialog"' = $html.Contains('role="dialog"')
  'fixed inset-0' = $html -match 'fixed inset-0'
  'nx-offer-modal' = $html.Contains('nx-offer-modal')
  'data-nx-offer-overlay' = $html.Contains('data-nx-offer-overlay')
}
Write-Output "HTTP_STATUS=200"
Write-Output "HAS_BANNER=$hasBanner"
Write-Output "HAS_OFFER_OPEN=$hasOpen"
Write-Output "BANNER_OR_NO_OPEN=$bannerOrNoOpen"
Write-Output "MODAL_SIGNALS:"
$modalSignals.GetEnumerator() | ForEach-Object { Write-Output ("  {0}={1}" -f $_.Key, $_.Value) }
$anyCouponModal = $modalSignals['data-nx-offer-open'] -or $modalSignals['data-nx-offer-overlay'] -or $modalSignals['nx-offer-modal']
Write-Output "COUPON_MODAL_PATTERN=$anyCouponModal"
if ($hasBanner) {
  $i = $html.IndexOf('data-nx-offer-banner')
  Write-Output ("SNIPPET=" + $html.Substring([Math]::Max(0,$i-60), [Math]::Min(220, $html.Length - [Math]::Max(0,$i-60))))
}
