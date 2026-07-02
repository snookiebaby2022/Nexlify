$html = Get-Content 'C:\Users\lizzi\nexlify-panel\.smoke-home.html' -Raw
@('offer-banner','offer-open','CouponLaunch','TrialCoupon','MarketingOverlays','nx-offer','coupon') | ForEach-Object {
  $c = ([regex]::Matches($html, [regex]::Escape($_), 'IgnoreCase')).Count
  if ($c -gt 0) { Write-Output "$_=$c" }
}
