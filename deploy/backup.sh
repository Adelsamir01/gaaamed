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
BACKUP_DIR="${DEDOS_BACKUP_DIR:-/var/backups/dedos}"
RETENTION_DAYS="${DEDOS_BACKUP_RETENTION_DAYS:-30}"
KEEP_COUNT="${DEDOS_BACKUP_KEEP:-30}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
destination="$BACKUP_DIR/dedos-$timestamp.dump"
temporary="$destination.tmp"

cd "$APP_DIR"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --username=dedos --dbname=dedos --format=custom --compress=9 >"$temporary"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --list <"$temporary" >/dev/null
mv "$temporary" "$destination"

sha256="$(sha256sum "$destination" | awk '{print $1}')"
bytes="$(stat -c '%s' "$destination")"
cat >"$destination.json" <<EOF
{"createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","engine":"postgresql","backup":"$destination","bytes":$bytes,"sha256":"$sha256"}
EOF

mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'dedos-*.dump' -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
for index in "${!backups[@]}"; do
  backup="${backups[$index]}"
  if (( index < KEEP_COUNT )) && [[ "$(find "$backup" -mtime "-$RETENTION_DAYS" -print)" ]]; then
    continue
  fi
  rm -f -- "$backup" "$backup.json"
done

printf '{"ok":true,"backup":"%s","bytes":%s,"sha256":"%s"}\n' "$destination" "$bytes" "$sha256"
