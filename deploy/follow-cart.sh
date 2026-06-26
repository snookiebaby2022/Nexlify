#!/usr/bin/env bash
echo "cart add pid=1:"
curl -sL -o /dev/null -w '%{url_effective}\n' 'https://billing.nexlify.live/cart.php?a=add&pid=1'
echo "store starter:"
curl -sL -o /dev/null -w '%{url_effective}\n' 'https://billing.nexlify.live/index.php?rp=/store/nexlify/starter-package'
echo "live page links:"
grep -oE 'https://billing\.nexlify\.live[^"<> ]+' /tmp/pricing.html 2>/dev/null | sort -u | head -20
