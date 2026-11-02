#!/usr/bin/env bash
# Run the CAD parser worker locally for DWG conversion + DXF extraction.
#
# Prereqs (one-time):
#   1. libredwg (provides /usr/local/bin/dwg2dxf or equivalent)
#      macOS:  brew install libredwg
#      Linux: use this directory's Dockerfile (pinned source build).
#   2. Python 3.12 on PATH
#   3. ../../web/.env.local containing:
#        PARSER_SHARED_SECRET=...
#
# The worker listens on http://localhost:8000.
# Set DXF_PARSER_URL=http://localhost:8000 in apps/web/.env.local to use it.

set -euo pipefail

cd "$(dirname "$0")"

# Pre-flight: check libredwg
if ! command -v dwg2dxf >/dev/null 2>&1; then
  echo "❌ dwg2dxf not found on PATH"
  echo ""
  echo "Install libredwg first:"
  echo "  macOS:  brew install libredwg"
  echo "  Linux: build the worker Dockerfile (includes LibreDWG)"
  echo ""
  echo "Without libredwg the worker can still parse DXF, but DWG conversion will fail."
  echo "Continue anyway? (y/N)"
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    exit 1
  fi
fi

# Pre-flight: check Python
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found on PATH"
  exit 1
fi

# Load env from apps/web/.env.local
ENV_FILE="../../web/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "⚠ No env file at $ENV_FILE — worker may fail authentication."
fi

# Set up venv
VENV_DIR=".venv"
if [[ ! -d "$VENV_DIR" ]]; then
  echo "🐍 Creating Python venv…"
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "Installing locked dependencies…"
pip install --quiet --require-hashes -r requirements.lock

PORT="${PORT:-8000}"
echo "🚀 Starting CAD parser on http://localhost:${PORT}"
echo "   Set DXF_PARSER_URL=http://localhost:${PORT} in apps/web/.env.local"
exec uvicorn src.main:app --host 0.0.0.0 --port "${PORT}" --reload
