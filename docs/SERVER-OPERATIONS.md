# Dedos server operations

The production target is one small always-on Linux VM running Docker Compose. SQLite in WAL mode is the durable store for the current single-server architecture; Cloudflare Tunnel exposes it without opening an inbound port. The Windows supervisors remain a working fallback until the VM is provisioned.

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

Requirements: a Debian/Ubuntu-style VM with Docker Engine and the Compose v2 plugin, the repository copied to the VM, and the existing Cloudflare tunnel token available as a file. The VM needs outbound HTTPS access; no inbound application port is required.

From the repository root on the VM:

```bash
sudo TUNNEL_TOKEN_FILE=/secure/path/tunnel-token.txt ./deploy/install-linux.sh
```

The installer copies the release to `/opt/dedos`, stores the token as `/etc/dedos/tunnel-token.txt` with mode `0600`, builds the container, and enables:

- `dedos-compose.service` at boot;
- `dedos-backup.timer` nightly with missed-run catch-up;
- `dedos-health.timer` every five minutes.

Configuration is in `/etc/dedos/dedos.env`. Never commit the tunnel token or that installed environment file.

### Publishing an Android update prompt

The app checks `https://dedos.adelsamir.com/api/app-version` at startup and when it returns to the foreground. After a new Play release is available to testers, update these values in `/etc/dedos/dedos.env` and redeploy the app service:

```bash
DEDOS_ANDROID_LATEST_VERSION=1.12.0
DEDOS_ANDROID_LATEST_VERSION_CODE=18
DEDOS_ANDROID_MIN_VERSION_CODE=0
```

Keep `DEDOS_ANDROID_MIN_VERSION_CODE=0` for a dismissible update reminder. Set it to a released version code only when older builds must be blocked; never announce a version before Google Play has finished publishing it.

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

The live database is `/data/dedos.sqlite` inside the app volume. Old JSON files are imported on first startup and left untouched. Writes use SQLite transactions and WAL crash recovery. Bank Elhaz statistics are coalesced into one write per 500 ms instead of rewriting storage for every event.

Backups are consistent SQLite snapshots written to the host directory configured by `DEDOS_BACKUP_DIR` (default `/var/backups/dedos`). The default policy retains up to 30 snapshots for 30 days, plus a SHA-256 manifest for each.

Manual backup and verification:

```bash
docker compose -f /opt/dedos/compose.production.yml exec -T app node tools/backup-server.mjs
docker compose -f /opt/dedos/compose.production.yml exec -T app node tools/verify-backup.mjs /backups/dedos-TIMESTAMP.sqlite
```

Copy `/var/backups/dedos` to a different machine or object-storage bucket. A backup on only the application VM is not a disaster-recovery copy. Restore by stopping the app, preserving the current volume database, copying a verified snapshot to `/data/dedos.sqlite`, and starting the app again.

## Health, metrics, and alerts

- `/health`: liveness and summary data.
- `/ready`: readiness including storage availability.
- `/metrics`: Prometheus-format uptime, connections, rooms, queue size, and health.

The health timer checks both localhost and the public Cloudflare URL. It restarts the app when local readiness fails and logs failures to the system journal. Set `ALERT_WEBHOOK_URL` in `/etc/dedos/dedos.env` to send failure JSON to a Slack-compatible automation or another incident webhook.

```bash
systemctl status dedos-compose.service
systemctl list-timers 'dedos-*'
journalctl -u dedos-health.service -n 100
docker compose -f /opt/dedos/compose.production.yml logs --tail=100
curl --fail https://dedos.adelsamir.com/health
```

## Capacity and scaling

The WebSocket server caps messages at 128 KiB, disconnects slow clients above 512 KiB buffered output, disables compression overhead, rate-limits message floods, and cleans dead connections every 20 seconds. HTTP requests have bounded header/body/time limits. The app reconnects forever with capped exponential backoff and network/foreground wake-up.

One VM is intentionally the first production topology because active rooms are in memory. Before running more than one app replica, move room state/pub-sub to Redis and replace the document store with PostgreSQL (or introduce sticky sessions plus shared state). Do not load-balance multiple replicas as-is.

## Incident sequence

1. Check public `/health`, then local `/ready`.
2. If local is down, inspect app logs and `docker compose restart app`.
3. If local works but public is down, inspect/restart `cloudflared`.
4. If storage reports unhealthy, stop the app, preserve the volume, verify the newest backup, and restore.
5. If the latest deploy caused the incident, run `deploy/rollback.sh`.
