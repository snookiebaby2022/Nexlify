#!/bin/bash
# Lock marketing website files on the VPS.
# Run as root: bash scripts/lock-marketing-files.sh
#
# This makes critical files read-only to prevent accidental modification.
# To unlock: bash scripts/unlock-marketing-files.sh

set -euo pipefail

MARKETING_DIR="${MARKETING_DIR:-/var/www/nexlify}"
MANIFEST="LOCKED_FILES.md"

if [ ! -d "$MARKETING_DIR" ]; then
  echo "Error: Marketing directory not found at $MARKETING_DIR"
  exit 1
fi

if [ ! -f "$MANIFEST" ]; then
  echo "Error: $MANIFEST not found. Run from marketing-drop-in/ directory."
  exit 1
fi

LOCKED=0
SKIPPED=0

while IFS= read -r line; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue
  line=$(echo "$line" | xargs)

  filepath="$MARKETING_DIR/$line"
  if [ -f "$filepath" ]; then
    chmod 444 "$filepath"
    echo "  🔒 $line"
    ((LOCKED++))
  else
    echo "  ⚠️  $line (not found, skipping)"
    ((SKIPPED++))
  fi
done < "$MANIFEST"

echo ""
echo "Locked: $LOCKED files"
echo "Skipped: $SKIPPED files (not found)"
echo ""
echo "To unlock all: bash scripts/unlock-marketing-files.sh"
