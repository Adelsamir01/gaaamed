# Dedos server operations

The production target is an always-on Linux VM running Docker Compose. PostgreSQL is the durable production store, Redis coordinates presence and targeted events, and dedicated Node worker threads run the public Snake and سيطر simulations. Cloudflare Tunnel exposes the gateway without opening an inbound application port. SQLite remains the zero-configuration local/Windows fallback.

## Current Windows fallback

Run `autostart/install-autostart.bat`. Without Administrator rights it installs supervised server and tunnel launchers under the current user's login. With Administrator rights it installs the `DedosServer` and `DedosTunnel` startup tasks under `SYSTEM`, so they start before login. Both supervisors restart crashes after five seconds and rotate 10 MB logs in `server/logs/`.

Useful checks:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/ready
Invoke-WebRequest -UseBasicParsing https://dedos.adelsamir.com/health
Get-Content server/logs/server.out.log -Tail 50
Get-Content server/logs/tunnel.err.log -Tail 50
```

The user-login fallback cannot run while the PC is powered off and only starts after that user signs in. Use the Linux deployment below to remove both limitations.

## Always-on Linux installation

Requirements: a Debian/Ubuntu-style VM with Docker Engine, the Compose v2 plugin, OpenSSL, the repository copied to the VM, and the existing Cloudflare tunnel token available as a file. The VM needs outbound HTTPS access; no inbound application port is required.

From the repository root on the VM:

```bash
sudo TUNNEL_TOKEN_FILE=/secure/path/tunnel-token.txt ./deploy/install-linux.sh
```

The installer copies the release to `/opt/dedos`, stores the token as `/etc/dedos/tunnel-token.txt` with mode `0600`, creates a random PostgreSQL password on first installation, builds the containers, and enables:

- `dedos-compose.service` at boot;
- `dedos-backup.timer` nightly with missed-run catch-up;
- `dedos-health.timer` every five minutes.

Configuration is in `/etc/dedos/dedos.env`. Never commit the tunnel token, database password, or that installed environment file. The production Compose stack starts PostgreSQL and Redis first and only starts the app after both dependencies are healthy.

### Publishing an Android update prompt

The app checks `https://dedos.adelsamir.com/api/app-version` at startup and when it returns to the foreground. After a new Play release is available to testers, update these values in `/etc/dedos/dedos.env` and redeploy the app service:

```bash
DEDOS_ANDROID_LATEST_VERSION=1.12.3
DEDOS_ANDROID_LATEST_VERSION_CODE=21
```

Every announced release is mandatory: builds below `DEDOS_ANDROID_LATEST_VERSION_CODE` show a non-dismissible update screen and cannot continue into the app. Never announce a version before Google Play has finished publishing it, otherwise users will be blocked before the update is available.

## Deploy and rollback

Copy the new release tree into `/opt/dedos`, then run:

```bash
sudo -E /opt/dedos/deploy/deploy.sh
```

The deploy script validates Compose, preserves the current image as `dedos-server:rollback`, builds the new image, starts it, and requires readiness within 60 seconds. Roll back with:

```bash
sudo -E /opt/dedos/deploy/rollback.sh
```

## Data and backups

Production data lives in the `dedos-postgres` volume. The adapter stores top-level document entries independently, so changing one chat thread or user does not rewrite the entire social database. On the first PostgreSQL startup, `DEDOS_MIGRATE_SQLITE_ON_EMPTY=true` imports an existing `/data/dedos.sqlite` only when PostgreSQL is empty. The source SQLite file is preserved.

Redis uses append-only persistence in the `dedos-redis` volume, but it contains coordination state rather than the source of truth. Losing Redis briefly affects shared presence/event delivery; it does not erase users or chats.

Nightly backups are PostgreSQL custom-format dumps written to `DEDOS_BACKUP_DIR` (default `/var/backups/dedos`). Each dump is validated with `pg_restore --list`, receives a SHA-256 manifest, and is subject to both age and count retention.

Manual backup:

```bash
sudo -E /opt/dedos/deploy/backup.sh
```

Verify and inspect a dump:

```bash
sha256sum -c <(jq -r '"\(.sha256)  \(.backup)"' /var/backups/dedos/dedos-TIMESTAMP.dump.json)
docker compose -f /opt/dedos/compose.production.yml exec -T postgres \
  pg_restore --list </var/backups/dedos/dedos-TIMESTAMP.dump
```

Restore into an empty maintenance database before using a backup in production:

```bash
docker compose -f /opt/dedos/compose.production.yml exec -T postgres createdb -U dedos dedos_restore
docker compose -f /opt/dedos/compose.production.yml exec -T postgres \
  pg_restore -U dedos -d dedos_restore --clean --if-exists </var/backups/dedos/dedos-TIMESTAMP.dump
```

Copy `/var/backups/dedos` to a different machine or object-storage bucket. A backup kept only on the application VM is not disaster recovery.

## Health, metrics, and alerts

- `/health`: liveness plus storage, Redis, arena-worker, memory, and realtime-loop details.
- `/ready`: readiness across PostgreSQL, Redis, and the arena runtime.
- `/metrics`: Prometheus-format uptime, health, memory, connections, rooms, queue size, and realtime performance.

The health timer checks both localhost and the public Cloudflare URL. It restarts the app when local readiness fails and logs failures to the system journal. Set `ALERT_WEBHOOK_URL` in `/etc/dedos/dedos.env` to send failure JSON to a Slack-compatible automation or another incident webhook.

```bash
systemctl status dedos-compose.service
systemctl list-timers 'dedos-*'
journalctl -u dedos-health.service -n 100
docker compose -f /opt/dedos/compose.production.yml logs --tail=100
curl --fail https://dedos.adelsamir.com/health
```

## Capacity and scaling

The WebSocket server caps messages at 128 KiB, disconnects slow clients above 512 KiB buffered output, disables compression overhead, rate-limits message floods, and cleans dead connections every 20 seconds. The listen backlog is 2,048. HTTP requests have bounded header/body/time limits. The app reconnects forever with capped exponential backoff and network/foreground wake-up.

Presence count broadcasts are coalesced to at most once per second, eliminating the previous connect/disconnect broadcast storm. Public arenas keep direct membership indexes, serialize one compatible snapshot per arena group, and use compact version-3 integer/delta/RLE payloads. `DEDOS_ARENA_WORKERS` controls arena worker threads; use `2` as the starting value and keep at least one CPU available for the gateway and OS.

Reproduce the guarded smoke suite:

```bash
npm run load:capacity
```

Run the full suite:

```bash
CAPACITY_SCALE=full npm run load:capacity
```

The July 2026 local reference run passed:

- 1,000 ramped connections and a separate 1,000-client reconnect burst with zero failures;
- 200 chat clients with 13 ms p95 measured delivery;
- 500 simultaneously active Snake clients at 35.6 ms gateway event-loop p99;
- 280 simultaneously active سيطر clients without stalls.

These are regression gates, not a promise for an undersized VM or slow network. Re-run them on the actual production instance while monitoring CPU, memory, outbound bandwidth, PostgreSQL latency, and Redis latency before a large campaign.

PostgreSQL and Redis make durability, presence, and targeted events shareable, but active private rooms and matchmaking queues still belong to one gateway process. Do not start multiple app replicas behind round-robin load balancing yet. A second phase would move queue/room ownership to Redis or another state service and add connection affinity. The current supported topology is one app gateway with multiple arena workers.

## Incident sequence

1. Check public `/health`, then local `/ready`.
2. If local is down, inspect app logs and `docker compose restart app`.
3. If local works but public is down, inspect/restart `cloudflared`.
4. If PostgreSQL reports unhealthy, stop the app, preserve the volume, validate the newest dump in a separate database, and restore.
5. If Redis reports unhealthy, restart Redis and confirm presence repopulates within 35 seconds.
6. If the latest deploy caused the incident, run `deploy/rollback.sh`.
