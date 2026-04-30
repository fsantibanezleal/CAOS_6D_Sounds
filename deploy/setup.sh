#!/usr/bin/env bash
# First-time setup on Hetzner VPS (run as root).
# Assumes A record auralis.fasl-work.com -> 91.99.199.70 already exists
# (covered by the existing *.fasl-work.com wildcard / parent zone).

set -euo pipefail

APP_NAME="auralis"
REPO="fsantibanezleal/CAOS_6D_Sounds"
APP_DIR="/opt/fasl-apps/CAOS_6D_Sounds"
DOMAIN="auralis.fasl-work.com"
PORT=8104

echo "[1/8] Clone or update repo..."
mkdir -p /opt/fasl-apps
if [ ! -d "$APP_DIR" ]; then
  git clone "https://github.com/${REPO}.git" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull --ff-only origin main
fi
cd "$APP_DIR"

echo "[2/8] Python venv + runtime deps..."
python3 -m venv .venv
.venv/bin/pip install --upgrade pip wheel
.venv/bin/pip install -r requirements.txt

echo "[3/8] Build frontend (Node 22 + pnpm already installed system-wide)..."
if [ -d frontend ]; then
  pushd frontend >/dev/null
  pnpm install --frozen-lockfile || pnpm install
  NODE_OPTIONS=--max-old-space-size=2048 pnpm build
  popd >/dev/null
fi

echo "[4/8] Env file (idempotent)..."
if [ ! -f /etc/fasl-${APP_NAME}.env ]; then
  cat > /etc/fasl-${APP_NAME}.env <<EOF
APP_ENV=production
APP_HOST=127.0.0.1
APP_PORT=${PORT}
ALLOWED_ORIGINS=https://${DOMAIN}
FRONTEND_DIST=frontend/dist
DATA_DIR=data
EOF
  chmod 600 /etc/fasl-${APP_NAME}.env
fi

echo "[5/8] systemd unit..."
cp deploy/fasl-${APP_NAME}.service /etc/systemd/system/fasl-${APP_NAME}.service
systemctl daemon-reload
systemctl enable fasl-${APP_NAME}
systemctl restart fasl-${APP_NAME}
sleep 2
systemctl is-active fasl-${APP_NAME}

echo "[6/8] nginx vhost (pre-TLS) ..."
# If the cert does not exist yet, install a plain HTTP vhost first so
# certbot can perform the http-01 challenge.
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  cat > /etc/nginx/sites-available/${DOMAIN}.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/${DOMAIN}.conf /etc/nginx/sites-enabled/${DOMAIN}.conf
  nginx -t && systemctl reload nginx

  echo "[7/8] Issue Let's Encrypt cert..."
  certbot --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos -m fsantibanez@gmail.com --redirect

  # Replace certbot's generated config with our hardened version.
  cp deploy/${DOMAIN}.conf /etc/nginx/sites-available/${DOMAIN}.conf
  nginx -t && systemctl reload nginx
else
  echo "[7/8] cert already present; installing hardened vhost..."
  cp deploy/${DOMAIN}.conf /etc/nginx/sites-available/${DOMAIN}.conf
  ln -sf /etc/nginx/sites-available/${DOMAIN}.conf /etc/nginx/sites-enabled/${DOMAIN}.conf
  nginx -t && systemctl reload nginx
fi

echo "[8/8] Smoke checks..."
curl -fsS -o /dev/null -w "  http://127.0.0.1:${PORT}/health -> %{http_code}\n" "http://127.0.0.1:${PORT}/health"
curl -fsS -o /dev/null -w "  https://${DOMAIN}/health -> %{http_code}\n" "https://${DOMAIN}/health"

echo ""
echo "Done. Visit: https://${DOMAIN}"
echo "Logs:        journalctl -u fasl-${APP_NAME} -f"
echo "Restart:     systemctl restart fasl-${APP_NAME}"
