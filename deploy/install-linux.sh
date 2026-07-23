#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this installer as root: sudo ./deploy/install-linux.sh" >&2
  exit 1
fi
command -v docker >/dev/null || { echo "Docker Engine is required." >&2; exit 1; }
command -v openssl >/dev/null || { echo "OpenSSL is required." >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 is required." >&2; exit 1; }

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/opt/dedos
TOKEN_SOURCE="${TUNNEL_TOKEN_FILE:-$SOURCE_DIR/sdk-installer/tunnel-token.txt}"

if [[ ! -f "$TOKEN_SOURCE" ]]; then
  echo "Tunnel token file not found: $TOKEN_SOURCE" >&2
  exit 1
fi

install -d -m 0755 "$APP_DIR" /etc/dedos /var/backups/dedos
tar --exclude=.git --exclude=node_modules --exclude=dist --exclude=runtime \
  --exclude=server/data --exclude=server/logs --exclude=server/backups \
  --exclude=sdk-installer -C "$SOURCE_DIR" -cf - . | tar -C "$APP_DIR" -xf -
install -m 0600 "$TOKEN_SOURCE" /etc/dedos/tunnel-token.txt
if [[ ! -f /etc/dedos/dedos.env ]]; then
  install -m 0600 "$APP_DIR/deploy/.env.example" /etc/dedos/dedos.env
fi
if grep -q '^DEDOS_POSTGRES_PASSWORD=CHANGE_ME$' /etc/dedos/dedos.env; then
  postgres_password="$(openssl rand -hex 32)"
  sed -i "s/^DEDOS_POSTGRES_PASSWORD=CHANGE_ME$/DEDOS_POSTGRES_PASSWORD=$postgres_password/" /etc/dedos/dedos.env
fi
install -m 0644 "$APP_DIR/deploy/dedos-compose.service" /etc/systemd/system/
install -m 0644 "$APP_DIR/deploy/dedos-backup.service" /etc/systemd/system/
install -m 0644 "$APP_DIR/deploy/dedos-backup.timer" /etc/systemd/system/
install -m 0644 "$APP_DIR/deploy/dedos-health.service" /etc/systemd/system/
install -m 0644 "$APP_DIR/deploy/dedos-health.timer" /etc/systemd/system/
chmod 0755 "$APP_DIR/deploy/"*.sh

systemctl daemon-reload
systemctl enable --now dedos-compose.service dedos-backup.timer dedos-health.timer
systemctl start dedos-health.service
echo "Dedos installed. Check: systemctl status dedos-compose.service"
