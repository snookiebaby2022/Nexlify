#!/bin/bash
n=$(redis-cli --scan --pattern 'nexlify:conn:q:*' | wc -l | tr -d ' ')
echo "keys=$n"
if [ "$n" -gt 0 ] && [ "$n" -lt 50000 ]; then
  redis-cli --scan --pattern 'nexlify:conn:q:*' | xargs -r redis-cli del
  echo cleared
fi
