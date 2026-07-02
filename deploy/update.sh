#!/usr/bin/env bash
# Concord — update the running server + idempotent HTTPS provisioning.
# Run as root on the VPS (normally invoked by .github/workflows/deploy.yml,
# which deploys from a GitHub runner — the provider sometimes drops packets
# from residential IPs, so deploys must not depend on the dev machine).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/concord}"
DOMAIN="${DOMAIN:-138-16-224-172.sslip.io}"
SERVER_PORT="${SERVER_PORT:-4000}"

echo "▶ Sync code…"
cd "$APP_DIR"
# npm install on the box dirties tracked package-lock.json, so `git pull
# --ff-only` silently fails. fetch+reset is safe: .env, dev.db*, node_modules
# and uploads/ are gitignored.
git fetch origin
git reset --hard origin/main

echo "▶ Server deps + schema…"
npm install --workspace server --no-fund --no-audit
cd server
DATABASE_URL=$(grep ^DATABASE_URL= ../.env | cut -d= -f2- | tr -d '"' || true)
export DATABASE_URL="${DATABASE_URL:-file:./dev.db}"
npx prisma db push --skip-generate
npx prisma generate
cd ..

# ── nginx: one :80 block (legacy clients use http://IP) and, once a Let's
#    Encrypt cert exists, a :443 block for the sslip.io domain. sslip.io maps
#    138-16-224-172.sslip.io → 138.16.224.172 with zero registration.
write_nginx() {
  local with_tls="$1"
  cat >/etc/nginx/sites-available/concord <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} _;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
NGINX
  if [ "$with_tls" = "yes" ]; then
    cat >>/etc/nginx/sites-available/concord <<NGINX

server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};
    client_max_body_size 0;

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
NGINX
  fi
  ln -sf /etc/nginx/sites-available/concord /etc/nginx/sites-enabled/concord
  nginx -t && systemctl reload nginx
}

echo "▶ nginx (:80)…"
write_nginx no

if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "▶ Let's Encrypt cert for ${DOMAIN}…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null
  apt-get install -y certbot python3-certbot-nginx >/dev/null
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    -m "admin@${DOMAIN}" --deploy-hook "systemctl reload nginx" \
    || echo "! certbot failed — continuing HTTP-only"
fi

if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "▶ nginx (:80 + :443)…"
  write_nginx yes
fi

echo "▶ Restart app…"
systemctl restart concord
sleep 3
curl -fsS "http://localhost:${SERVER_PORT}/health" >/dev/null && echo "health: OK"
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  curl -fsS "https://${DOMAIN}/health" >/dev/null && echo "https: OK"
fi
echo "✅ Deploy finished."
