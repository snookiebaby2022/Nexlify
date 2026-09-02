#!/bin/bash
for u in \
  'https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/2' \
  'https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/10' \
  'http://zee-portal.xyz/ghostface/bHwC552glfki2026/823'; do
  echo "URL $u"
  curl -sS -L -o /dev/null -w "http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}\n" \
    --max-time 12 -H "User-Agent: VLC/3.0.20" "$u"
done
