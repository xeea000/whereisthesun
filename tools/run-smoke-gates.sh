#!/bin/bash
# Run SUNNY deploy smoke gates against a worktree dir (default: cwd).
# Gates: layer-budget (required if script present), kids-render (optional if present).
set -e
D="${1:-.}"
cd "$D"
PORT="${SUNNY_SMOKE_PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"
pkill -f "python3 -m http.server ${PORT}" 2>/dev/null || true
python3 -m http.server "$PORT" >/tmp/sunny-smoke-http.log 2>&1 &
HTTP_PID=$!
cleanup(){ kill $HTTP_PID 2>/dev/null || true; }
trap cleanup EXIT
sleep 1
# wait for server
for i in 1 2 3 4 5 6 7 8; do
  curl -sf -o /dev/null "$URL" && break
  sleep 0.5
done
EC=0
if [ -f tools/smoke-layer-budget.py ]; then
  echo ":: gate layer-budget"
  SUNNY_BUDGET_OUT="${SUNNY_BUDGET_OUT:-/tmp/sunny-layer-budget.json}" \
    python3 tools/smoke-layer-budget.py "$URL" || EC=$?
  if [ "$EC" -ne 0 ]; then
    echo "layer-budget gate failed (exit $EC)"
    exit "$EC"
  fi
fi
# Coordinate with kids-render gate (other worker): accept either filename.
for KIDS in tools/smoke-kids-render.py tools/smoke-kids-render.js tools/smoke-kids.py; do
  if [ -f "$KIDS" ]; then
    echo ":: gate kids-render ($KIDS)"
    if [[ "$KIDS" == *.py ]]; then
      python3 "$KIDS" "$URL" || EC=$?
    else
      node "$KIDS" "$URL" || EC=$?
    fi
    if [ "$EC" -ne 0 ]; then
      echo "kids-render gate failed (exit $EC)"
      exit "$EC"
    fi
    break
  fi
done
echo ":: smoke gates ok"
exit 0
