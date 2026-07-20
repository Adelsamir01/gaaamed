#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DEDOS_APP_DIR:-/opt/dedos}"
COMPOSE_FILE="$APP_DIR/compose.production.yml"
PUBLIC_URL="${PUBLIC_HEALTH_URL:-https://dedos.adelsamir.com/health}"

failure=""
if ! curl --fail --silent --max-time 10 http://127.0.0.1:8787/ready >/dev/null; then
  failure="local readiness failed"
  cd "$APP_DIR"
  docker compose -f "$COMPOSE_FILE" restart app
fi
if ! curl --fail --silent --max-time 15 "$PUBLIC_URL" >/dev/null; then
  failure="${failure:+$failure; }public health failed"
fi

if [[ -n "$failure" ]]; then
  logger -t dedos-health "$failure"
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl --silent --show-error --max-time 10 -X POST -H 'content-type: application/json' \
      --data "{\"service\":\"dedos\",\"error\":\"$failure\"}" "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
  exit 1
fi
