#!/bin/bash
# Run on 85.17.162.54 in WEB CONSOLE to allow your Windows PC to SSH in.
# Edit PUBKEY line below with output of:  Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub

PUBKEY="PASTE_YOUR_WINDOWS_PUBLIC_KEY_ONE_LINE_HERE"

if [ "$PUBKEY" = "PASTE_YOUR_WINDOWS_PUBLIC_KEY_ONE_LINE_HERE" ]; then
  echo "Edit this file: set PUBKEY to your .pub key line"
  exit 1
fi

mkdir -p ~/.ssh
chmod 700 ~/.ssh
grep -qF "$PUBKEY" ~/.ssh/authorized_keys 2>/dev/null || echo "$PUBKEY" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "Key added. Test from Windows: ssh root@85.17.162.54 echo OK"
