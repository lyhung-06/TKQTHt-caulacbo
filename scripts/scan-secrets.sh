#!/bin/sh
set -eu

GITLEAKS_IMAGE="zricethezav/gitleaks:v8.24.2"
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

docker run --rm \
    -v "$REPO_ROOT:/repo:ro" \
    "$GITLEAKS_IMAGE" \
    detect --source=/repo --redact --no-banner

docker run --rm \
    -v "$REPO_ROOT:/repo:ro" \
    "$GITLEAKS_IMAGE" \
    detect --source=/repo --no-git --redact --no-banner
