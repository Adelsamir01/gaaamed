#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${DEDOS_ENV_FILE:-/etc/dedos/dedos.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi
APP_DIR="${DEDOS_APP_DIR:-/opt/dedos}"
COMPOSE_FILE="$APP_DIR/compose.production.yml"

docker image inspect dedos-server:rollback >/dev/null
cd "$APP_DIR"
DEDOS_IMAGE=dedos-server:rollback docker compose -f "$COMPOSE_FILE" up -d --no-build app
curl --fail --retry 20 --retry-delay 2 http://127.0.0.1:8787/ready
