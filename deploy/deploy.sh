#!/usr/bin/env bash
# Deploys the tournament container on the server, same flow as the ubiqiti stack.
#
# Usage: deploy/deploy.sh [--check] [image-tag]
#   --check:   only checks (.env, disk space, compose file), changes nothing.
#   image-tag: release version to run, e.g. 1.2.0 (default: latest).
#
# Configuration via environment:
#   STACK_DIR    directory holding the server's .env (required)
#   MIN_FREE_GB  minimum free space on / and the Docker root (default 2)
set -euo pipefail

: "${STACK_DIR:?STACK_DIR setzen (Verzeichnis mit der .env auf dem Server)}"
MIN_FREE_GB="${MIN_FREE_GB:-2}"
COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"

log() { echo "[deploy] $*"; }
die() { echo "::error::$*" >&2; exit 1; }

CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then CHECK_ONLY=1; shift; fi
export TT_IMAGE_TAG="${1:-latest}"

[[ -f "$STACK_DIR/.env" ]] || die "$STACK_DIR/.env fehlt (Vorlage: deploy/.env.example)."
compose() { docker compose --project-name tt-turnier --env-file "$STACK_DIR/.env" -f "$COMPOSE_FILE" "$@"; }

# 1) Enough space? If not, prune first, then check again.
free_gb() { df -P --block-size=1G "$1" | awk 'NR==2 {print $4}'; }
docker_root="$(docker info --format '{{.DockerRootDir}}')"
check_space() {
  local ok=0
  for d in / "$docker_root"; do
    local f; f="$(free_gb "$d")"
    if (( f < MIN_FREE_GB )); then log "Nur ${f}G frei auf $d (Minimum ${MIN_FREE_GB}G)"; ok=1; fi
  done
  return $ok
}
if ! check_space; then
  (( CHECK_ONLY )) && die "Zu wenig Platz frei."
  log "Räume ungenutzte Images und Build-Cache auf (Volumes bleiben unangetastet)"
  docker image prune --all --force --filter "until=24h" >/dev/null
  check_space || die "Platte voll: auch nach Prune weniger als ${MIN_FREE_GB}G frei."
fi

# 2) Deploy. Pull first, then swap: a failed pull leaves the running container alone.
compose config --quiet
if (( CHECK_ONLY )); then
  log "Check ok: .env da, genug Platz, Compose-Datei gültig. Nichts geändert."
  exit 0
fi
log "Deploye Image-Tag $TT_IMAGE_TAG"
compose pull --quiet
compose up --detach --remove-orphans --wait --wait-timeout 120
log "Container läuft und ist healthy"

# 3) Remove old images; the last 30 days stay for a rollback.
docker image prune --all --force --filter "until=720h" >/dev/null
log "Fertig."
