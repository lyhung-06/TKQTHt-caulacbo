# Hardening deployment checklist

## Docker networks and privileges

Compose separates traffic into `frontend`, `backend`, `monitoring`, and `proxy_metrics`. Only Nginx publishes host ports 80/443; Prometheus binds only to VM loopback for an SSH tunnel. MySQL is on the internal backend network and has no published port. The web app is attached to backend for DB access and monitoring for Prometheus scraping. Nginx status is on a separate internal network shared only with its exporter. Adminer was removed because it had no controlled proxy route.

Application and exporters run without Linux capabilities, with `no-new-privileges`, read-only root filesystems, small tmpfs mounts, and per-service CPU/memory/PID limits. MySQL requires its data volume writable and its official entrypoint starts as root to initialize/drop privileges; the rest of the root filesystem is read-only and selected unnecessary capabilities are dropped. cAdvisor needs host filesystem/kernel visibility; it is not privileged, but retains `SYS_ADMIN`, root UID, host mounts and `/dev/kmsg`. Promtail runs as root to read container log files and requires Docker socket access; `:ro` on the socket does not restrict Docker API operations, so treat Promtail as host-administrator-equivalent. Node Exporter shares the host PID namespace and mounts host `/proc`, `/sys`, and root read-only.

These controls have not been validated by starting containers in this environment. In particular, the restricted cAdvisor capability set and image-specific read-only filesystem behavior must be tested on the target Linux VM.

## Database grants

The official MySQL `MYSQL_USER` bootstrap grant was removed. `db-app-init` creates the application account after schema initialization and grants only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the configured application schema. Re-running setup revokes pre-existing grants and reapplies the allowlist. No DDL, global privilege, or `GRANT OPTION` is given to the web account. `db-monitor-init` grants `PROCESS`, `REPLICATION CLIENT`, and `SELECT` only on `performance_schema`; the information-schema tables collector was removed to avoid needing table-data-wide SELECT.

This requires a DB password of at least 32 characters using only letters, numbers, `_`, and `-`, to keep SQL account setup safely quoted. Do not reuse the former database password. Existing named MySQL volumes retain their contents; init scripts run on startup and apply grants but do not recreate/drop user data.

MySQL root is allowed to connect from the Compose backend network because the one-shot grant initializers run as separate containers. The backend is internal and only DB/bootstrap/exporter/app services attach to it; root credentials are not passed to the web container. Run the disposable-schema privilege check with `docker compose --profile verify run --rm db-hardening-check`. It creates a uniquely named probe database, verifies the app account cannot drop it, verifies the exporter cannot read `users`, prints only privilege names/scopes, then removes the probe database.

## Secrets and Git scanning

On Linux, run `scripts/prepare-env.sh` to create `.env` if absent and apply mode 600. The script does not display its contents. `.env`, private keys, certificates, dependency directories, and evidence are ignored by Git. `.env.example` contains placeholders only.

Run `scripts/scan-secrets.sh` on the target using pinned Gitleaks to inspect Git history and the working tree. Build the two project images with `docker compose build web alert-sink`, then run `scripts/scan-images.sh` to scan each fixed image with Trivy `aquasec/trivy:0.58.2`, including unfixed findings. These scripts use Docker to run scanners; the image scan mounts the Docker socket, which is host-administrator-equivalent. Use trusted pinned scanner images on the deployment VM. Record only findings summary and remediation in ignored `evidence/buoc6-hardening.txt`, never paste secret values into evidence.

The app and monitor grant setup validates usernames and password character sets before constructing SQL. `.env.example` now shows the required DB password shape. Rotate any existing app password that does not satisfy the documented format before deployment.

The one-shot `db-seed-passwords` service hashes `ADMIN_INITIAL_PASSWORD`, `OFFICER_INITIAL_PASSWORD`, and `MEMBER_INITIAL_PASSWORD` with bcrypt and updates only the seeded accounts through the restricted application DB user. It does not print the supplied passwords. Recreate this one-shot container deliberately when rotating seed credentials; do not remove or reset the MySQL volume. Verify its exit status and account access on the target before relying on it. This bootstrap and its DB behavior have not been tested against a running MySQL instance in the current environment.

## UFW

Do not enable UFW remotely until the active SSH port and a second recovery path are confirmed. On the VM console or a verified session:

```sh
sudo ufw allow <SSH_PORT>/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw status verbose
sudo ufw enable
sudo ufw status verbose
```

Keep the current SSH session open and establish a second SSH session before closing it. Verify SSH, HTTP redirect, and HTTPS from another terminal before considering the firewall change complete. These commands are instructions only; this project did not change a host firewall.

Docker-published ports may bypass UFW's normal INPUT processing due to Docker's NAT/forwarding rules. Do not treat UFW alone as proof that a published service is private. This Compose publishes only Nginx; Prometheus is explicitly bound to `127.0.0.1`, and database/monitoring services have no host ports. Verify actual listener/firewall rules on the VM and, where required, filter Docker forwarding with supported DOCKER-USER/nftables policy.

## Runtime evidence commands

Run only on the Linux VM after starting the stack:

```sh
docker compose ps
docker compose exec web id
docker compose exec nginx id
docker compose exec db id
docker network inspect club_frontend club_backend club_monitoring club_proxy_metrics
sudo ss -lntup
docker compose --profile verify run --rm db-hardening-check
sh scripts/scan-secrets.sh
sh scripts/scan-images.sh
sudo ufw status verbose
```

Also capture HTTPS headers/TLS versions, the application workflows for the three roles, Grafana/Loki/alert status, and the independent SSH-session check if UFW is enabled. Do not report these checks as passed until they have been run and their real outputs reviewed.
