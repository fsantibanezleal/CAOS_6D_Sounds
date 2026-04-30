#!/usr/bin/env bash
# Re-pull the repo, rebuild frontend and restart the service.
# Idempotent — safe to call from cron or by hand on the VPS.

set -euo pipefail

APP_NAME="auralis"
APP_DIR="/opt/fasl-apps/CAOS_6D_Sounds"

cd "$APP_DIR"

echo "[1/4] git pull..."
git fetch --quiet origin
git checkout main
git pull --ff-only origin main

echo "[2/4] backend deps..."
.venv/bin/pip install --quiet --upgrade -r requirements.txt

echo "[3/4] frontend build..."
if [ -d frontend ]; then
  pushd frontend >/dev/null
  pnpm install --frozen-lockfile || pnpm install
  NODE_OPTIONS=--max-old-space-size=2048 pnpm build
  popd >/dev/null
fi

echo "[4/4] systemctl restart fasl-${APP_NAME}"
systemctl restart fasl-${APP_NAME}
sleep 2
systemctl is-active fasl-${APP_NAME}
echo "Done."
