#!/usr/bin/env bash
# Concord — one-command server setup for Ubuntu 24.04 (run as root).
#
#   curl -fsSL https://raw.githubusercontent.com/ZubaraX/concord/main/deploy/setup.sh | bash
# or:
#   DOMAIN=chat.example.com bash deploy/setup.sh   # enables HTTPS via Let's Encrypt
#
# Idempotent: safe to re-run to update (git pull + migrate + restart).
set -euo pipefail

REPO="${REPO:-https://github.com/ZubaraX/concord.git}"
APP_DIR="${APP_DIR:-/opt/concord}"
DOMAIN="${DOMAIN:-}"
SERVER_PORT="${SERVER_PORT:-4000}"

echo "▶ Installing system packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx ufw openssl ca-certificates

echo "▶ Ensuring Node.js 20+…"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "▶ Fetching the app to ${APP_DIR}…"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "▶ Configuring .env…"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  echo "  • generated fresh JWT secrets"
fi

echo "▶ Installing dependencies + database…"
npm install --no-fund --no-audit
npm run db:generate
npm run db:deploy
npm run db:seed || true   # ok if already seeded

echo "▶ Installing systemd service…"
TSX="$APP_DIR/node_modules/.bin/tsx"
cat >/etc/systemd/system/concord.service <<UNIT
[Unit]
Description=Concord server (API + gateway)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
ExecStart=$TSX src/index.ts
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable concord
systemctl restart concord

echo "▶ Configuring nginx reverse proxy (WebSocket + unlimited uploads)…"
cat >/etc/nginx/sites-available/concord <<NGINX
server {
    listen 80;
    server_name ${DOMAIN:-_};
    client_max_body_size 0;   # no upload size cap

    location / {
        proxy_pass http://127.0.0.1:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;   # keep WebSockets open
    }
}
NGINX
ln -sf /etc/nginx/sites-available/concord /etc/nginx/sites-enabled/concord
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "▶ Firewall…"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
yes | ufw enable  >/dev/null 2>&1 || true

if [ -n "$DOMAIN" ]; then
  echo "▶ HTTPS via Let's Encrypt for ${DOMAIN}…"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" --redirect || \
    echo "  ! certbot failed (is the DNS A-record pointing here yet?)"
fi

IP=$(curl -fsS https://api.ipify.org || echo "<server-ip>")
echo ""
echo "✅ Concord is live."
echo "   Server URL for the desktop app:"
if [ -n "$DOMAIN" ]; then echo "     https://${DOMAIN}"; else echo "     http://${IP}"; fi
echo "   Service:  systemctl status concord   |   logs: journalctl -u concord -f"
