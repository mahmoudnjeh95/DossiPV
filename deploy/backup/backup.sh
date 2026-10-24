#!/usr/bin/env bash
# Nightly DossiPV backup: the Postgres database (pg_dump custom format) and the uploaded/generated
# files (the dossipv_files Docker volume), into a dated local directory with a checksum file, then
# optionally copied off the server with rclone. Retention: 7 daily + 4 weekly (Sunday's) locally.
#
# Runs on the server host (not in a container) as root, from dossipv-backup.timer. Settings come
# from the environment or from /etc/dossipv/backup.env (see backup.env.example). Every step logs a
# line; any failure exits non-zero so the systemd unit shows as failed.
#
# Runbook: docs/runbooks/backup-and-restore.md

set -euo pipefail
# The backups hold client personal data (CIN, addresses, bills): readable by root only.
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
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
# ISO weekday (1 = Monday … 7 = Sunday) whose backup is also kept as a weekly one.
WEEKLY_DAY="${BACKUP_WEEKLY_DAY:-7}"
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
HEARTBEAT_URL="${BACKUP_HEARTBEAT_URL:-}"

log() {
  printf '%s [dossipv-backup] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

WORK=""
on_exit() {
  local status=$?
  if [[ -n "$WORK" && -d "$WORK" ]]; then
    rm -rf -- "$WORK"
  fi
  if [[ $status -ne 0 ]]; then
    log "FAILED (exit $status) — the previous backups are untouched"
  fi
}
trap on_exit EXIT

# Deletes all but the newest $2 dated (YYYY-MM-DD) directories in $1.
prune() {
  local dir="$1" keep="$2" old
  [[ -d "$dir" ]] || return 0
  find "$dir" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' -printf '%f\n' \
    | sort -r | tail -n "+$((keep + 1))" \
    | while read -r old; do
        log "retention: removing $dir/$old"
        rm -rf -- "${dir:?}/$old"
      done
}

command -v docker >/dev/null || fail "docker not found"
command -v sha256sum >/dev/null || fail "sha256sum not found"
[[ -z "$RCLONE_REMOTE" ]] || command -v rclone >/dev/null || fail "BACKUP_RCLONE_REMOTE is set but rclone is not installed"

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"
chmod 700 "$BACKUP_ROOT"

# One run at a time (a manual run during the nightly one would race on the same directory).
exec 9>"$BACKUP_ROOT/.lock"
flock -n 9 || fail "another backup is already running"

[[ "$(docker inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER" 2>/dev/null)" == "true" ]] \
  || fail "container $POSTGRES_CONTAINER is not running"
docker volume inspect "$FILES_VOLUME" >/dev/null 2>&1 || fail "volume $FILES_VOLUME not found"
# Tar runs in the image the database already uses: always present on the server, nothing to pull.
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-$(docker inspect -f '{{.Config.Image}}' "$POSTGRES_CONTAINER")}"

DATE="$(date +%F)"
FINAL="$BACKUP_ROOT/daily/$DATE"
# Built under a hidden name and renamed at the end, so a dated directory is always complete.
WORK="$BACKUP_ROOT/daily/.$DATE.partial"
rm -rf -- "$WORK"
mkdir -p "$WORK"

log "start: database $POSTGRES_DB ($POSTGRES_CONTAINER) and volume $FILES_VOLUME -> $FINAL"

log "database: pg_dump"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$WORK/dossipv.dump" \
  || fail "pg_dump failed"
# A dump pg_restore cannot read is worse than none: it looks like a backup.
docker exec -i "$POSTGRES_CONTAINER" pg_restore --list >/dev/null <"$WORK/dossipv.dump" \
  || fail "the dump is not readable by pg_restore"
log "database: ok ($(du -h "$WORK/dossipv.dump" | cut -f1))"

log "files: archiving volume $FILES_VOLUME"
docker run --rm --network none --user 0 --entrypoint tar -v "$FILES_VOLUME:/data:ro" "$HELPER_IMAGE" \
  -czf - -C /data . >"$WORK/files.tar.gz" \
  || fail "archiving the files volume failed"
gzip -t "$WORK/files.tar.gz" || fail "the files archive is corrupt"
log "files: ok ($(du -h "$WORK/files.tar.gz" | cut -f1))"

(cd "$WORK" && sha256sum dossipv.dump files.tar.gz >SHA256SUMS)

rm -rf -- "$FINAL"
mv -- "$WORK" "$FINAL"
WORK=""
log "saved $FINAL"

if [[ "$(date +%u)" == "$WEEKLY_DAY" ]]; then
  rm -rf -- "$BACKUP_ROOT/weekly/$DATE"
  # Hard links: the weekly copy costs no extra disk space while the daily one still exists.
  cp -al -- "$FINAL" "$BACKUP_ROOT/weekly/$DATE"
  log "weekly: kept $BACKUP_ROOT/weekly/$DATE"
fi

prune "$BACKUP_ROOT/daily" "$KEEP_DAILY"
prune "$BACKUP_ROOT/weekly" "$KEEP_WEEKLY"

if [[ -n "$RCLONE_REMOTE" ]]; then
  REMOTE="${RCLONE_REMOTE%/}"
  log "off-site: copying to $REMOTE"
  # `copy`, not `sync`: if the local backups are ever wiped, the next run must not wipe the
  # off-site ones too. Old remote copies are aged out separately below.
  rclone copy --checksum "$FINAL" "$REMOTE/daily/$DATE" || fail "rclone copy to $REMOTE failed"
  if [[ -d "$BACKUP_ROOT/weekly/$DATE" ]]; then
    rclone copy --checksum "$BACKUP_ROOT/weekly/$DATE" "$REMOTE/weekly/$DATE" || fail "rclone copy (weekly) failed"
  fi
  rclone delete --min-age "$((KEEP_DAILY + 1))d" "$REMOTE/daily" || fail "rclone retention (daily) failed"
  rclone delete --min-age "$((KEEP_WEEKLY * 7 + 1))d" "$REMOTE/weekly" || fail "rclone retention (weekly) failed"
  rclone rmdirs --leave-root "$REMOTE" 2>/dev/null || true
  log "off-site: ok"
else
  log "off-site: skipped (BACKUP_RCLONE_REMOTE not set) — the backups only exist on this server"
fi

if [[ -n "$HEARTBEAT_URL" ]]; then
  # Dead man's switch: the monitor alerts when this ping stops arriving.
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEARTBEAT_URL" || log "warning: heartbeat ping failed"
fi

log "done"
