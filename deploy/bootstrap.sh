#!/usr/bin/env bash
# One-time setup of the Lightsail box (Ubuntu 24.04), 20 Sep 2026.
#
# Run ONCE as the `ubuntu` user from the Lightsail browser terminal:
#   curl -fsSL https://raw.githubusercontent.com/rajatmittal-359/shopmaster-pro/main/deploy/bootstrap.sh | bash
#
# What it does, in order: Docker + compose plugin, a 2 GB swap file (a 2 GB
# box building nothing still likes headroom), unattended security updates,
# fail2ban on SSH, the /srv/shopmaster folder with compose + Caddyfile and two
# env TEMPLATES you then fill by hand (never in git, never in chat). Idempotent:
# safe to run again.
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/rajatmittal-359/shopmaster-pro/main/deploy"
DIR=/srv/shopmaster

echo "▸ packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl fail2ban unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  echo "▸ docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

if ! swapon --show | grep -q swapfile; then
  echo "▸ 2 GB swap"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "▸ security updates on, fail2ban on"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
sudo systemctl enable --now fail2ban >/dev/null

echo "▸ $DIR"
sudo mkdir -p "$DIR/env"
sudo chown -R "$USER":"$USER" "$DIR"
chmod 700 "$DIR/env"
curl -fsSL "$REPO_RAW/compose.yml" -o "$DIR/compose.yml"
curl -fsSL "$REPO_RAW/Caddyfile" -o "$DIR/Caddyfile"
curl -fsSL "$REPO_RAW/release.sh" -o "$DIR/release.sh" && chmod +x "$DIR/release.sh"

# The tag file the deploy step rewrites; `latest` until the first release.
[ -f "$DIR/.env" ] || printf 'TAG=latest\nSITE_HOST=www.shopmasterpro.in\nAPEX_HOST=shopmasterpro.in\n' > "$DIR/.env"

# Env templates - filled ONCE by hand: nano env/api.env, nano env/web.env
if [ ! -f "$DIR/env/api.env" ]; then
  cat > "$DIR/env/api.env" <<'EOT'
# backend/.env for production - copy each value from backend/.env.example's
# list, with the PRODUCTION values (new Atlas user + shopmaster_prod database,
# live Razorpay, Brevo, Shiprocket, the Google SA as GOOGLE_SA_KEY_JSON, AI
# keys). This file never leaves the box.
NODE_ENV=production
PORT=5000
MONGO_URI=
JWT_SECRET=
FRONTEND_URL=https://www.shopmasterpro.in
SITE_URL=https://www.shopmasterpro.in
COOKIE_SECURE=true
RETURN_KIND_REQUIRED=true
EOT
  chmod 600 "$DIR/env/api.env"
fi
if [ ! -f "$DIR/env/web.env" ]; then
  cat > "$DIR/env/web.env" <<'EOT'
# Runtime-only values for the Next server. The NEXT_PUBLIC_* ones are baked
# into the image at build (GitHub → repository Variables), not read here.
NODE_ENV=production
EOT
  chmod 600 "$DIR/env/web.env"
fi

echo
echo "Done. Next:"
echo "  1. nano $DIR/env/api.env   ← paste the production values (see backend/.env.example)"
echo "  2. Log out and in again (docker group), then:  cd $DIR && ./release.sh latest"
echo "  3. Point DNS at this box; Caddy fetches the certificate on its own."
