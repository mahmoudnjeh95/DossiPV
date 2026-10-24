#!/usr/bin/env bash
# Restores a DossiPV backup made by backup.sh.
#
#   restore.sh [--db-only | --files-only] <YYYY-MM-DD | backup directory>
#       Restores PRODUCTION: stops app and worker, saves the current state to
#       $BACKUP_ROOT/pre-restore/<timestamp>/, replaces the database (pg_restore --clean) and the
#       content of the files volume, then starts app and worker again.
#
#   restore.sh --scratch [--db-only | --files-only] <YYYY-MM-DD | backup directory>
#       Restore drill that leaves production alone: the database goes into a separate database
#       ($SCRATCH_DB, default dossipv_restore_check) in the same Postgres container, the files into
#       $BACKUP_ROOT/restore-check/<date>/files on the host.
#
# A date is looked up in daily/ then weekly/. Asks for confirmation before changing anything.
# Runbook: docs/runbooks/backup-and-restore.md

set -euo pipefail
umask 077

CONFIG_FILE="${BACKUP_CONFIG:-/etc/dossipv/backup.env}"
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/dossipv}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-dossipv-postgres-1}"
POSTGRES_DB="${POSTGRES_DB:-dossipv}"
POSTGRES_USER="${POSTGRES_USER:-dossipv}"
FILES_VOLUME="${FILES_VOLUME:-dossipv_files}"
APP_CONTAINERS="${APP_CONTAINERS:-dossipv-app-1 dossipv-worker-1}"
SCRATCH_DB="${SCRATCH_DB:-dossipv_restore_check}"

log() {
  printf '%s [dossipv-restore] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

SCRATCH=false
DO_DB=true
DO_FILES=true
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scratch) SCRATCH=true ;;
    --db-only) DO_FILES=false ;;
    --files-only) DO_DB=false ;;
    -h | --help) usage ;;
    -*) log "unknown option: $1"; usage ;;
    *) [[ -z "$TARGET" ]] || usage; TARGET="$1" ;;
  esac
  shift
done
[[ -n "$TARGET" ]] || usage
[[ "$DO_DB" == true || "$DO_FILES" == true ]] || fail "--db-only and --files-only together restore nothing"

if [[ -d "$TARGET" ]]; then
  SOURCE="$(cd "$TARGET" && pwd)"
elif [[ -d "$BACKUP_ROOT/daily/$TARGET" ]]; then
  SOURCE="$BACKUP_ROOT/daily/$TARGET"
elif [[ -d "$BACKUP_ROOT/weekly/$TARGET" ]]; then
  SOURCE="$BACKUP_ROOT/weekly/$TARGET"
else
  fail "no backup '$TARGET' (looked in $BACKUP_ROOT/daily and $BACKUP_ROOT/weekly)"
fi

[[ -f "$SOURCE/SHA256SUMS" ]] || fail "$SOURCE has no SHA256SUMS: not a complete backup"
[[ "$DO_DB" == false || -f "$SOURCE/dossipv.dump" ]] || fail "$SOURCE has no dossipv.dump (use --files-only)"
[[ "$DO_FILES" == false || -f "$SOURCE/files.tar.gz" ]] || fail "$SOURCE has no files.tar.gz (use --db-only)"
log "checking checksums in $SOURCE"
(cd "$SOURCE" && sha256sum --quiet -c SHA256SUMS) || fail "checksum mismatch: the backup is damaged"

[[ "$(docker inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null)" == "true" ]] \
  || fail "container $POSTGRES_CONTAINER is not running"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-$(docker inspect -f '{{.Config.Image}}' "$POSTGRES_CONTAINER")}"

psql_admin() {
  docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres "$@"
}

if [[ "$SCRATCH" == true ]]; then
  [[ "$SCRATCH_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || fail "SCRATCH_DB must be a plain lowercase name"
  [[ "$SCRATCH_DB" != "$POSTGRES_DB" ]] || fail "SCRATCH_DB must differ from the production database"
  SCRATCH_FILES="$BACKUP_ROOT/restore-check/$(basename "$SOURCE")/files"
  echo
  echo "Restore drill from $SOURCE (production is not touched):"
  [[ "$DO_DB" == false ]] || echo "  - database  -> $SCRATCH_DB (dropped and recreated) in $POSTGRES_CONTAINER"
  [[ "$DO_FILES" == false ]] || echo "  - files     -> $SCRATCH_FILES (emptied first)"
  CONFIRM_WORD="drill"
else
  echo
  echo "PRODUCTION RESTORE from $SOURCE:"
  echo "  - stops: $APP_CONTAINERS"
  echo "  - saves the current state to $BACKUP_ROOT/pre-restore/"
  [[ "$DO_DB" == false ]] || echo "  - REPLACES database $POSTGRES_DB (everything since the backup is lost)"
  [[ "$DO_FILES" == false ]] || echo "  - REPLACES the content of volume $FILES_VOLUME"
  CONFIRM_WORD="restore"
fi
echo
read -r -p "Type '$CONFIRM_WORD' to continue: " answer
[[ "$answer" == "$CONFIRM_WORD" ]] || fail "cancelled, nothing changed"

if [[ "$SCRATCH" == true ]]; then
  if [[ "$DO_DB" == true ]]; then
    log "database: recreating $SCRATCH_DB"
    psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\"" -c "CREATE DATABASE \"$SCRATCH_DB\" OWNER \"$POSTGRES_USER\"" >/dev/null
    log "database: pg_restore into $SCRATCH_DB"
    docker exec -i "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$SCRATCH_DB" --no-owner --exit-on-error \
      <"$SOURCE/dossipv.dump" || fail "pg_restore into $SCRATCH_DB failed"
    log "database: ok — inspect with: docker exec -it $POSTGRES_CONTAINER psql -U $POSTGRES_USER -d $SCRATCH_DB"
  fi
  if [[ "$DO_FILES" == true ]]; then
    rm -rf -- "$SCRATCH_FILES"
    mkdir -p "$SCRATCH_FILES"
    log "files: extracting into $SCRATCH_FILES"
    tar -xzf "$SOURCE/files.tar.gz" -C "$SCRATCH_FILES" || fail "extracting the files failed"
    log "files: ok ($(find "$SCRATCH_FILES" -type f | wc -l) files)"
  fi
  log "drill done. Clean up afterwards: see the runbook (drop $SCRATCH_DB, rm -rf $BACKUP_ROOT/restore-check)"
  exit 0
fi

# --- production restore ---

STOPPED=()
restart_apps() {
  if [[ ${#STOPPED[@]} -gt 0 ]]; then
    log "starting ${STOPPED[*]}"
    docker start "${STOPPED[@]}" >/dev/null || log "WARNING: could not start ${STOPPED[*]} — start them by hand"
  fi
}
# Whatever happens below, app and worker come back up.
trap restart_apps EXIT

for container in $APP_CONTAINERS; do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" == "true" ]]; then
    log "stopping $container"
    docker stop "$container" >/dev/null
    STOPPED+=("$container")
  fi
done

SAFETY="$BACKUP_ROOT/pre-restore/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$SAFETY"
log "safety copy of the current state -> $SAFETY"
if [[ "$DO_DB" == true ]]; then
  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$SAFETY/dossipv.dump" \
    || fail "could not dump the current database; nothing restored"
fi
if [[ "$DO_FILES" == true ]]; then
  docker run --rm --network none --user 0 --entrypoint tar -v "$FILES_VOLUME:/data:ro" "$HELPER_IMAGE" \
    -czf - -C /data . >"$SAFETY/files.tar.gz" \
    || fail "could not archive the current files; nothing restored"
fi
# Makes the safety copy restorable with this same script.
(cd "$SAFETY" && sha256sum -- * >SHA256SUMS)

if [[ "$DO_DB" == true ]]; then
  log "database: pg_restore --clean into $POSTGRES_DB"
  # One transaction: on any error the database stays exactly as it was.
  docker exec -i "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --clean --if-exists --no-owner --single-transaction --exit-on-error <"$SOURCE/dossipv.dump" \
    || fail "pg_restore failed; the database was rolled back (safety copy in $SAFETY)"
  log "database: ok"
fi

if [[ "$DO_FILES" == true ]]; then
  log "files: replacing the content of $FILES_VOLUME"
  docker run --rm -i --network none --user 0 --entrypoint sh -v "$FILES_VOLUME:/data" "$HELPER_IMAGE" \
    -c 'find /data -mindepth 1 -delete && tar -xzf - -C /data' <"$SOURCE/files.tar.gz" \
    || fail "restoring the files failed (safety copy in $SAFETY/files.tar.gz)"
  log "files: ok"
fi

log "restore done from $SOURCE (previous state kept in $SAFETY)"
