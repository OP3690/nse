#!/usr/bin/env bash
# One-time setup: create a Python venv for the pipeline and install deps.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE/pipeline"

echo "Creating virtualenv at pipeline/.venv ..."
python3 -m venv .venv
./.venv/bin/pip install --quiet --upgrade pip
./.venv/bin/pip install --quiet -r requirements.txt
echo "Pipeline ready."

echo "Installing web dependencies ..."
cd "$HERE/web"
npm install --silent
echo "Web ready."

echo
echo "Next steps:"
echo "  1) Seed history:   cd pipeline && ./.venv/bin/python backfill.py 20"
echo "  2) Daily run:      ./scripts/run.sh"
echo "  3) Start the site: cd web && npm run dev   (http://localhost:4321)"
