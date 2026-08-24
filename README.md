# WhatsApp Filter → Obsidian

Self-hosted, free, filters selected WhatsApp groups, dedupes text and media,
drops noise, writes clean Markdown into your Obsidian vault, and syncs it to
your phone/laptop via Syncthing. Managed through a small web dashboard.

**Stack:** Node.js + Baileys (direct, no WAHA wrapper) · SQLite · Express
dashboard · Syncthing · Docker Compose · GCP e2-micro (Always Free tier).

---

## 1. Create the GCP free-tier VM

1. Go to https://console.cloud.google.com and sign up (requires a card for
   verification, but the resources below stay inside the Always Free tier —
   you won't be charged as long as you don't change the specs).
2. Create a new Project (top bar → New Project).
3. In the search bar, enable the **Compute Engine API** and wait for it to
   activate (~1 min).
4. Go to **Compute Engine → VM Instances → Create Instance**:
   - **Name:** `wa-filter`
   - **Region:** one of `us-west1`, `us-central1`, or `us-east1` — these are
     the only regions eligible for the Always Free e2-micro.
   - **Machine type:** `e2-micro` (do not change this, it's the free one)
   - **Boot disk:** Ubuntu 24.04 LTS, **Standard persistent disk, 30GB**
     (30GB is the free-tier cap — don't go over)
   - Leave everything else default, click **Create**.
5. Note the VM's **External IP** once it's running.

## 2. Install the gcloud CLI locally (or use the in-browser SSH button)

Easiest path: on the VM instance's row in the console, click the **SSH**
button — this opens a browser terminal, no local install needed. Use that
for everything below unless noted.

## 3. Install Docker on the VM

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Get the project onto the VM

Simplest: push this project to a private GitHub repo, then on the VM:

```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-filter.git
cd whatsapp-filter
```

(Or `scp -r` the folder from your laptop if you'd rather not use git.)

## 5. Configure

```bash
cp .env.example .env
nano .env
```

Set at minimum:
- `DASHBOARD_PASS` — change this from the default, it's your dashboard login.
- Leave `VAULT_PATH=/data/vault` and `STATE_PATH=/data/state` as-is — these
  map to the Docker volumes already wired up in `docker-compose.yml`.

## 6. Start everything

```bash
docker compose up -d --build
docker compose logs -f app
```

Watch the logs — you should see `[dashboard] listening on port 8080` and
Baileys generating a QR shortly after.

## 7. Reach the dashboard (via SSH tunnel — don't expose it publicly)

The dashboard is bound to `127.0.0.1:8080` on the VM on purpose — it's not
reachable from the internet even though it has a password, as one more layer
of protection since this is watching your personal messages. To reach it,
tunnel over SSH from your laptop:

```bash
gcloud compute ssh wa-filter --zone=YOUR_ZONE -- -L 8080:localhost:8080
```

(Find `YOUR_ZONE` on the VM instance page, e.g. `us-central1-a`.) Then open
**http://localhost:8080** in your browser, log in with the dashboard
credentials from your `.env`, and scan the QR code that appears (WhatsApp →
Linked Devices → Link a Device).

**Recommendation:** link a secondary WhatsApp number here if you have one,
not your primary — this runs unattended 24/7, and all of these unofficial
libraries (Baileys included) carry some ban risk from WhatsApp's side.

## 8. Pick your groups and filters

Once connected, the dashboard's **Groups** section populates automatically.
Toggle on the ones you want filtered. Add any noise keywords under
**Blocked keywords**, and tune the text-length/media-size thresholds under
**Settings**. Changes apply live — no restart needed.

## 9. Set up Syncthing to reach your phone and laptop

1. Tunnel to the Syncthing GUI too: add `-L 8384:localhost:8384` to the same
   `gcloud compute ssh` command (or run a second tunnel).
2. Open **http://localhost:8384**, go to **Actions → Show ID**, copy the
   device ID.
3. On your phone/laptop's existing Syncthing app, **Add Remote Device**,
   paste that ID.
4. Back in the VM's Syncthing GUI, accept the incoming device request, then
   share the `vault` folder (already mounted at `/var/syncthing/vault`,
   which is the same folder the app writes to) with that device.
5. On your phone, accept the folder share and point it at (or symlink into)
   your Obsidian vault's `WhatsApp/` location.

From here on, every filtered message the app writes to `data/vault/WhatsApp/`
gets picked up by Syncthing and pushed to your devices automatically.

## 10. Open the GCP firewall only for what actually needs it

Syncthing's sync ports (22000/tcp+udp, 21027/udp) are already exposed in
`docker-compose.yml`, but GCP blocks inbound traffic by default — you need a
firewall rule to let them through:

**VPC Network → Firewall → Create Firewall Rule**
- Name: `syncthing`
- Direction: Ingress
- Targets: your VM (or all instances)
- Source IP ranges: `0.0.0.0/0`
- Protocols/ports: `tcp:22000`, `udp:22000`, `udp:21027`

Do **not** open 8080 or 8384 — those stay SSH-tunnel-only.

---

## How it works, in one paragraph

Baileys links to your WhatsApp account the same way WhatsApp Web does (no
browser, direct WebSocket) and receives every message your account sees.
Each incoming group message is checked against your enabled-groups
allowlist, filtered for noise (stickers, reactions, short "ok"/"lol"
messages, blocked keywords), checked against a SQLite hash table to drop
duplicates (same text or same file re-forwarded), and — if it has media
under your size cap — downloaded and saved. What survives gets appended as a
Markdown callout to today's note in your vault. Syncthing does the rest.

## Extending later

- **AI summarization:** once this is stable, a nightly cron job reading each
  day's note and calling a free-tier LLM API (or local Ollama) for a digest
  is a clean bolt-on — it doesn't need to touch any of the core pipeline.
- **Perceptual image dedup:** right now media dedup is exact-byte-match
  (catches the same file re-forwarded). Catching *resized/recompressed*
  reposts would need a perceptual hash (pHash) — worth adding once you see
  how often that actually happens in practice.
- **Remote group/keyword control from WhatsApp itself:** currently all
  config goes through the dashboard. A command interface (message the linked
  number itself) is a reasonable v2 if the dashboard tunnel becomes annoying
  on the go.
