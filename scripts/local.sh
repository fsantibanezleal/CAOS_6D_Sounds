#!/usr/bin/env bash
# Auralis — local dev runner (macOS / Linux / Git Bash)
# Mirrors scripts/local.ps1 subcommand-for-subcommand.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CMD="${1:-help}"

show_help() {
  cat <<'EOF'

Auralis — local dev runner

Subcommands:
  dev       Start backend (uvicorn :8104) + frontend dev server (Vite :5173)
  build     Build the frontend bundle into frontend/dist
  preview   Build the frontend then run the FastAPI server alone
  ingest    Run the data pipeline (extract features + embeddings + manifest)
  seed      Generate synthetic seed clips and run ingest
  clean     Remove build outputs and caches
  stop      Kill local Python and Node processes started by 'dev'
  help      Show this message

Equivalents on Windows: scripts\local.ps1 <subcommand>
EOF
}

ensure_venv() {
  if [ ! -d .venv ]; then
    echo "Creating .venv ..."
    python -m venv .venv 2>/dev/null || python3 -m venv .venv
  fi
  PY=".venv/bin/python"
  [ -x "$PY" ] || PY=".venv/Scripts/python.exe"
  "$PY" -m pip install --upgrade pip wheel >/dev/null
  "$PY" -m pip install -r requirements.txt >/dev/null
}

ensure_pipeline_venv() {
  if [ ! -d .venv-pipeline ]; then
    echo "Creating .venv-pipeline ..."
    python -m venv .venv-pipeline 2>/dev/null || python3 -m venv .venv-pipeline
  fi
  PYP=".venv-pipeline/bin/python"
  [ -x "$PYP" ] || PYP=".venv-pipeline/Scripts/python.exe"
  "$PYP" -m pip install --upgrade pip wheel >/dev/null
  "$PYP" -m pip install -r data-pipeline/requirements.txt >/dev/null
}

ensure_frontend() {
  if [ ! -d frontend/node_modules ]; then
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm install; else npm install; fi
    popd >/dev/null
  fi
}

case "$CMD" in
  dev)
    ensure_venv
    ensure_frontend
    PY=".venv/bin/python"; [ -x "$PY" ] || PY=".venv/Scripts/python.exe"
    echo "[backend] uvicorn :8104 (in background)"
    "$PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8104 &
    BACK=$!
    trap 'kill $BACK 2>/dev/null || true' EXIT
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm dev; else npm run dev; fi
    popd >/dev/null
    ;;

  build)
    ensure_frontend
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm build; else npm run build; fi
    popd >/dev/null
    ;;

  preview)
    ensure_venv
    "$0" build
    PY=".venv/bin/python"; [ -x "$PY" ] || PY=".venv/Scripts/python.exe"
    echo "Backend serving the built SPA at http://127.0.0.1:8104"
    "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8104
    ;;

  ingest)
    ensure_pipeline_venv
    PYP=".venv-pipeline/bin/python"; [ -x "$PYP" ] || PYP=".venv-pipeline/Scripts/python.exe"
    "$PYP" data-pipeline/ingest.py
    ;;

  seed)
    ensure_pipeline_venv
    PYP=".venv-pipeline/bin/python"; [ -x "$PYP" ] || PYP=".venv-pipeline/Scripts/python.exe"
    "$PYP" data-pipeline/synthetic_seeds.py
    "$PYP" data-pipeline/ingest.py --seed-synthetic
    ;;

  clean)
    find . -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
    rm -rf frontend/dist frontend/.vite
    echo "Cleaned build outputs."
    ;;

  stop)
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    echo "Stopped local dev processes."
    ;;

  help|*)
    show_help
    ;;
esac
