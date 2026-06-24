# Deploying Concord (Ubuntu 24.04)

One command on a fresh server (as root):

```bash
# HTTP, reachable by IP (fine for the desktop app):
curl -fsSL https://raw.githubusercontent.com/ZubaraX/concord/main/deploy/setup.sh | bash

# or with a domain → automatic HTTPS:
curl -fsSL https://raw.githubusercontent.com/ZubaraX/concord/main/deploy/setup.sh | DOMAIN=chat.example.com bash
```

What it does:
- installs Node 20, nginx, ufw, certbot
- clones the repo to `/opt/concord`, generates JWT secrets in `.env`
- installs deps, runs Prisma migrations, seeds the demo data
- runs the server as a **systemd** service (`concord`) — 24/7, auto-restart, autostart on boot
- nginx reverse proxy with **WebSocket** support and **no upload size limit**
- firewall (OpenSSH + 80/443), HTTPS if `DOMAIN` is set

Re-run the same command any time to **update** (it pulls, migrates, restarts).

Manage it:
```bash
systemctl status concord
journalctl -u concord -f      # live logs
systemctl restart concord
```

After deploy, rebuild the desktop installer with the new URL baked in:
```bash
# on the dev machine, in client/
VITE_API_URL="https://chat.example.com" npm run build && npx electron-builder
```

## Optional: coturn (TURN) for lowest-latency WebRTC voice

The app currently relays voice/screen through the server (works everywhere).
If you later switch back to peer-to-peer WebRTC for minimal latency, run coturn:

```bash
apt-get install -y coturn
cat >/etc/turnserver.conf <<EOF
realm=concord
listening-port=3478
min-port=49152
max-port=65535
fingerprint
lt-cred-mech
user=concord:CHANGE_ME
EOF
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable --now coturn
ufw allow 3478 && ufw allow 3478/udp && ufw allow 49152:65535/udp
```
Then set in `/opt/concord/.env`:
```
TURN_URLS=turn:YOUR_IP:3478,turn:YOUR_IP:3478?transport=tcp
TURN_USERNAME=concord
TURN_PASSWORD=CHANGE_ME
```
and `systemctl restart concord`.
