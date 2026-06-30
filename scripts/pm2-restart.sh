#!/bin/bash
# scripts/pm2-restart.sh — Safe restart for Nexlify panel
# Kills orphaned processes on port 13000 before starting PM2

set -e

PORT="${PANEL_PORT:-13000}"
DIR="/home/nexlify-panel"

echo "=== Nexlify Panel Restart ==="
echo "Port: $PORT"

# Step 1: Stop PM2 app
pm2 stop nexlify 2>/dev/null || true
sleep 2

# Step 2: Kill any orphaned process on port
echo "[1/3] Checking for orphaned processes on port $PORT..."
for i in $(seq 1 30); do
  if ! ss -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "Port $PORT is free"
    break
  fi
  echo "  Port $PORT still in use — cleaning up..."
  
  PIDS=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K\d+' || true)
  for pid in $PIDS; do
    if [ "$pid" != "$$" ] && [ "$pid" != "" ]; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  
  sleep 1
  
  # Force kill remaining
  PIDS=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K\d+' || true)
  for pid in $PIDS; do
    if [ "$pid" != "$$" ] && [ "$pid" != "" ]; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  
  sleep 1
done

# Step 3: Start PM2 app
echo "[2/3] Starting PM2 nexlify app..."
cd "$DIR"
pm2 start ecosystem.config.cjs --only nexlify

# Step 4: Verify
echo "[3/3] Verifying panel is responding..."
for i in $(seq 1 15); do
  if curl -sfI -H "User-Agent: Mozilla/5.0" "http://127.0.0.1:$PORT/login" >/dev/null 2>&1; then
    echo "✅ Panel is up and running on port $PORT"
    pm2 save
    exit 0
  fi
  echo "  Waiting for panel to be ready (attempt $i/15)..."
  sleep 2
done

echo "❌ Panel failed to start within 30 seconds"
exit 1
