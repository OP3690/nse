#!/usr/bin/env bash
# Daily pipeline run. Uses the venv if present, else system python3.
# Logs to logs/run-YYYY-MM-DD.log. Safe to run repeatedly.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE/pipeline"

mkdir -p "$HERE/logs"
LOG="$HERE/logs/run-$(date +%F).log"

if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

echo "[$(date '+%F %T')] starting run" | tee -a "$LOG"
"$PY" run_daily.py "$@" 2>&1 | tee -a "$LOG"
echo "[$(date '+%F %T')] finished" | tee -a "$LOG"
