# Voice / Screen-share connectivity (TURN)

Concord's voice & screen-share are **peer-to-peer (WebRTC)** between the two
client machines. The server only relays signaling. When both people are on
different home networks behind NAT, a direct P2P link usually **can't be
established** — you need a **TURN relay**. Symptoms when TURN is missing/broken:

- screen share shows a **black screen**
- **voice doesn't transmit**
- the call bar shows **"No media — needs TURN"**

The built-in free public TURN (OpenRelay) is unreliable/deprecated, so set up
your own. **No app reinstall is needed** — the client fetches the TURN config
from the server's `/api/ice` on every call, so just configure the server and
restart it.

## Option A — Metered free TURN (fastest, good for testing)

1. Sign up at <https://www.metered.ca/tools/openrelay/> (free, ~50 GB/mo).
2. From the dashboard copy your TURN credentials, then add them to `.env` in
   the Codespace (or wherever the server runs):

   ```env
   TURN_URLS=turn:a.relay.metered.ca:80,turn:a.relay.metered.ca:443,turn:a.relay.metered.ca:443?transport=tcp
   TURN_USERNAME=<your metered username>
   TURN_PASSWORD=<your metered credential>
   ```
3. Restart the server: `npm run dev:server`.
4. Both people **restart the app** (or rejoin the call). It now relays through
   TURN — black screen / no-voice should be gone.

## Option B — Self-hosted coturn (best, for your rented VPS)

On a VPS with a public IP (this is the proper long-term fix):

```bash
# docker-compose.turn.yml on the VPS
services:
  coturn:
    image: coturn/coturn:latest
    network_mode: host
    restart: unless-stopped
    command: >
      -n --realm=concord --no-cli --no-tls --no-dtls
      --min-port=49152 --max-port=65535
      --user=concord:CHANGE_ME --lt-cred-mech
```

Open UDP/TCP **3478** and UDP **49152–65535** in the firewall, then on the
server's `.env`:

```env
TURN_URLS=turn:YOUR_VPS_IP:3478,turn:YOUR_VPS_IP:3478?transport=tcp
TURN_USERNAME=concord
TURN_PASSWORD=CHANGE_ME
```

Restart the server. Done — reliable voice/screen-share across any network.

> Note: Codespaces can't host coturn well (it doesn't forward the UDP port
> range), which is why Option A or a real VPS is needed while testing there.

## Quick local test (no TURN needed)

If both people are on the **same Wi-Fi/LAN**, P2P works with STUN alone — a
good way to confirm the app itself is fine and the issue is purely NAT/TURN.
