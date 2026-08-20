#!/bin/bash
# NEXLIFY PANEL - FULL TEST SUITE RUNNER
# Usage: ./test.sh [options]
# 
# Environment variables:
#   PANEL_URL       - Your panel URL (default: http://localhost:3000)
#   XUI_URL         - XUI reference URL (default: http://localhost:8080)
#   TEST_USER       - Test username (default: admin)
#   TEST_PASS       - Test password (default: admin)
#   ADMIN_API_KEY   - Admin API key from panel settings
#   FFmpeg_PATH     - Path to ffprobe (default: ffprobe)

set -e

echo "🚀 NEXLIFY Panel Test Suite"
echo "=========================="

# Check dependencies
check_cmd() {
  if ! command -v "$1" &> /dev/null; then
    echo "❌ Missing: $1"
    exit 1
  fi
}

check_cmd node
check_cmd npx
check_cmd curl
check_cmd ffprobe

# Install tsx if needed
if ! npx --yes tsx --version &> /dev/null; then
  echo "📦 Installing tsx..."
  npm install -g tsx 2>/dev/null || npx --yes tsx --version
fi

# Run tests
echo ""
echo "Configuration:"
echo "  Panel:     ${PANEL_URL:-http://localhost:3000}"
echo "  XUI Ref:   ${XUI_URL:-http://localhost:8080}"
echo "  User:      ${TEST_USER:-admin}"
echo "  FFprobe:   ${FFPROBE_PATH:-ffprobe}"
echo ""

PANEL_URL="${PANEL_URL:-http://localhost:3000}" \
XUI_URL="${XUI_URL:-http://localhost:8080}" \
TEST_USER="${TEST_USER:-admin}" \
TEST_PASS="${TEST_PASS:-admin}" \
ADMIN_API_KEY="${ADMIN_API_KEY}" \
FFPROBE_PATH="${FFPROBE_PATH:-ffprobe}" \
npx tsx test-runner.ts

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ ALL TESTS PASSED"
else
  echo "❌ SOME TESTS FAILED - Check test-results/report.json"
fi

exit $EXIT_CODE