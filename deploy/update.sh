#!/usr/bin/env bash
# Re-pull the repo, rebuild frontend and restart the service.
# Idempotent — safe to call from cron or by hand on the VPS.

set -euo pipefail

APP_NAME="auralis"
APP_DIR="/opt/fasl-apps/CAOS_6D_Sounds"
DOMAIN="auralis.fasl-work.com"

cd "$APP_DIR"

echo "[1/5] git pull..."
git fetch --quiet origin
git checkout main
git pull --ff-only origin main

echo "[2/5] backend deps..."
.venv/bin/pip install --quiet --upgrade -r requirements.txt

echo "[3/5] frontend build..."
if [ -d frontend ]; then
  pushd frontend >/dev/null
  pnpm install --frozen-lockfile || pnpm install
  NODE_OPTIONS=--max-old-space-size=2048 pnpm build
  popd >/dev/null
fi

echo "[4/5] nginx vhost sync..."
# Reapply only when the in-repo vhost differs from the installed one,
# so we avoid an unnecessary nginx reload on routine code-only deploys.
VHOST_SRC="deploy/${DOMAIN}.conf"
VHOST_DST="/etc/nginx/sites-available/${DOMAIN}.conf"
if [ -f "$VHOST_SRC" ] && ! cmp -s "$VHOST_SRC" "$VHOST_DST"; then
  cp "$VHOST_SRC" "$VHOST_DST"
  if nginx -t; then
    systemctl reload nginx
    echo "  nginx vhost updated and reloaded."
  else
    echo "  ERROR: nginx -t failed; vhost copy reverted." >&2
    git -C "$APP_DIR" checkout -- "$VHOST_SRC" 2>/dev/null || true
    exit 1
  fi
else
  echo "  vhost unchanged."
fi

echo "[5/5] systemctl restart fasl-${APP_NAME}"
systemctl restart fasl-${APP_NAME}
sleep 2
systemctl is-active fasl-${APP_NAME}
echo "Done."
