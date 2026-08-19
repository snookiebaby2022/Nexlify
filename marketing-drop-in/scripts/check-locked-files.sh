#!/bin/bash
# Pre-commit hook: prevents modifications to locked files.
# Run: bash scripts/check-locked-files.sh
# Or install as git hook: cp scripts/check-locked-files.sh .git/hooks/pre-commit

set -euo pipefail

MANIFEST="LOCKED_FILES.md"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f "$MANIFEST" ]; then
  echo -e "${YELLOW}Warning: $MANIFEST not found — skipping locked file check${NC}"
  exit 0
fi

# Parse locked files from manifest (skip comments and blank lines)
LOCKED_FILES=()
while IFS= read -r line; do
  # Skip comments and blank lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue
  # Trim whitespace
  line=$(echo "$line" | xargs)
  LOCKED_FILES+=("$line")
done < "$MANIFEST"

if [ ${#LOCKED_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}No locked files in manifest — check passed${NC}"
  exit 0
fi

# Get list of staged files (added, modified, renamed)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=AMR 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
  echo -e "${GREEN}No staged file changes — check passed${NC}"
  exit 0
fi

VIOLATIONS=()
for locked in "${LOCKED_FILES[@]}"; do
  for staged in $STAGED_FILES; do
    if [ "$staged" = "$locked" ]; then
      VIOLATIONS+=("$locked")
    fi
  done
done

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  LOCKED FILE MODIFICATION BLOCKED                   ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${RED}The following locked files cannot be modified:${NC}"
  for v in "${VIOLATIONS[@]}"; do
    echo -e "  ${RED}✗ $v${NC}"
  done
  echo ""
  echo -e "${YELLOW}To unlock a file, remove it from LOCKED_FILES.md and re-stage:${NC}"
  echo -e "  git reset HEAD <file>"
  echo -e "  # Edit LOCKED_FILES.md to remove the file"
  echo -e "  git add LOCKED_FILES.md <file>"
  echo ""
  echo -e "${YELLOW}To bypass this check (use with caution):${NC}"
  echo -e "  git commit --no-verify"
  exit 1
fi

echo -e "${GREEN}Locked files check passed — no violations${NC}"
exit 0
