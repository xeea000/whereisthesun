#!/bin/bash
# Run SUNNY deploy smoke gates against a worktree dir (default: cwd).
# Gates: layer-budget (required if script present), kids-render (optional if present).
# Default = FULL mode: every layer's download budget (about an hour). Use it for broad changes.
# Targeted mode for small sniped fixes: SUNNY_GATE_LAYERS="mtg,parks" runs the same budget gate for only
# those layers, then tools/smoke-mtg-card.py when SUNNY_GATE_CARD=1 and tools/smoke-drag.py when SUNNY_GATE_DRAG=1, tools/smoke-bugs.py when SUNNY_GATE_BUGS=1, tools/test-wind-field.js when SUNNY_GATE_WIND=1. Lint still runs in sdeploy either way.
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
  if [ -n "$SUNNY_GATE_LAYERS" ]; then export SUNNY_BUDGET_ONLY="$SUNNY_GATE_LAYERS"; echo ":: TARGETED mode: layers $SUNNY_GATE_LAYERS"; else echo ":: FULL mode: all layers"; fi
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
if [ "$SUNNY_GATE_CARD" = "1" ] && [ -f tools/smoke-mtg-card.py ]; then
  python3 tools/test-mtg-classify.py >/dev/null || { python3 tools/test-mtg-classify.py | grep FAIL; echo "mtg classify fixtures failed"; exit 1; }
  echo ":: gate mtg-card (phone width)"
  python3 tools/smoke-mtg-card.py "$URL" || { echo "mtg-card gate failed"; exit 1; }
fi
if [ "$SUNNY_GATE_DRAG" = "1" ] && [ -f tools/smoke-drag.py ]; then
  echo ":: gate drag (phone touch gestures)"
  python3 tools/smoke-drag.py "$URL" || { echo "drag gate failed"; exit 1; }
fi
if [ "$SUNNY_GATE_WIND" = "1" ] && [ -f tools/test-wind-field.js ]; then
  echo ":: gate wind-field (sampling and whole tiles across the antimeridian)"
  node tools/test-wind-field.js || { echo "wind-field gate failed"; exit 1; }
fi
if [ "$SUNNY_GATE_BUGS" = "1" ] && [ -f tools/smoke-bugs.py ]; then
  echo ":: gate bugs (t378u focused regressions; SUNNY_BUGS_ONLY picks checks)"
  python3 tools/smoke-bugs.py "$URL" || { echo "bugs gate failed"; exit 1; }
fi
echo ":: smoke gates ok"
exit 0
