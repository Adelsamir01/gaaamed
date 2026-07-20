#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DEDOS_APP_DIR:-/opt/dedos}"
COMPOSE_FILE="$APP_DIR/compose.production.yml"
IMAGE="${DEDOS_IMAGE:-dedos-server:latest}"

cd "$APP_DIR"
docker compose -f "$COMPOSE_FILE" config --quiet
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker image tag "$IMAGE" dedos-server:rollback
fi
docker compose -f "$COMPOSE_FILE" build --pull app
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:8787/ready >/dev/null; then
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep 2
done

docker compose -f "$COMPOSE_FILE" logs --tail=100 app
exit 1
