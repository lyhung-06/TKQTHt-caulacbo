#!/bin/sh
set -eu

TRIVY_IMAGE="aquasec/trivy:0.58.2"
images="
club-web:1.0.0
club-alert-sink:1.0.0
mysql:8.0.39
nginx:1.26.2-alpine
prom/prometheus:v2.54.1
grafana/grafana:11.2.0
grafana/loki:3.1.1
grafana/promtail:3.1.1
gcr.io/cadvisor/cadvisor:v0.49.1
nginx/nginx-prometheus-exporter:1.3.0
prom/mysqld-exporter:v0.15.1
prom/node-exporter:v1.8.2
"

docker volume create club_trivy_cache >/dev/null

for image in $images; do
    echo "=== Trivy CRITICAL/HIGH: $image ==="
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v club_trivy_cache:/root/.cache/trivy \
        "$TRIVY_IMAGE" \
        image --scanners vuln --severity CRITICAL,HIGH "$image"
done
