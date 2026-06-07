#!/usr/bin/env bash
# Fast incremental refresh (last few sessions + live snapshots + KNN + emit).
# Used by the 6-hourly launchd job AND the in-app Sync button.
# Single-flight: a lockfile prevents overlapping runs. Logs to logs/refresh-*.log.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE/pipeline"

mkdir -p "$HERE/logs"
LOG="$HERE/logs/refresh-$(date +%F).log"
LOCKDIR="$HERE/logs/refresh.lock"

# Single-flight lock via atomic mkdir (portable; flock isn't on stock macOS).
# A stale lock older than 30 min is reclaimed in case a prior run was killed.
if [ -d "$LOCKDIR" ] && [ -n "$(find "$LOCKDIR" -prune -mmin +30 2>/dev/null)" ]; then
  rm -rf "$LOCKDIR"
fi
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "[$(date '+%F %T')] refresh already running — skipping" | tee -a "$LOG"
  exit 0
fi
trap 'rm -rf "$LOCKDIR"' EXIT

if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

echo "[$(date '+%F %T')] refresh start" | tee -a "$LOG"
"$PY" refresh.py "$@" 2>&1 | tee -a "$LOG"
echo "[$(date '+%F %T')] refresh done" | tee -a "$LOG"
