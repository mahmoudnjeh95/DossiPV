# Runbook: backups and restore

Every night at 02:30 the server backs up the two things that cannot be rebuilt from the repo:

- the **database** (`dossipv` in the `dossipv-postgres-1` container), as a `pg_dump -Fc` file;
- the **files volume** (`dossipv_files`: uploaded bills, CIN copies, datasheets, generated
  dossiers), as a `.tar.gz`.

Scripts: `deploy/backup/backup.sh` and `deploy/backup/restore.sh`, run by
`deploy/backup/dossipv-backup.timer` / `.service`. Each backup is a dated directory:

```
/var/backups/dossipv/
  daily/2026-10-24/{dossipv.dump, files.tar.gz, SHA256SUMS}   # last 7 days
  weekly/2026-10-19/…                                        # last 4 Sundays (hard links, no extra space)
  pre-restore/…                                              # state saved by restore.sh before overwriting
```

The backups contain client personal data (names, CIN, addresses, phone numbers, STEG bills). They
are root-only on the server (`umask 077`, directory mode 700), and an off-site copy **must** be
encrypted (see §2).

## 1. Install on the server (once)

From a workstation with the repo checked out:

```bash
scp deploy/backup/* debian@<server>:/tmp/
ssh debian@<server>
sudo install -d -m 700 /opt/dossipv/backup /etc/dossipv
sudo install -m 700 /tmp/backup.sh /tmp/restore.sh /opt/dossipv/backup/
sudo install -m 600 /tmp/backup.env.example /etc/dossipv/backup.env
sudo install -m 644 /tmp/dossipv-backup.service /tmp/dossipv-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dossipv-backup.timer
systemctl list-timers dossipv-backup.timer      # shows the next run
```

`/etc/dossipv/backup.env` holds the settings (all optional, defaults shown in the file). Edit it
with `sudo nano /etc/dossipv/backup.env`. Re-copy the scripts the same way when they change in the
repo (the deploy workflow does not install them).

Disk space: a backup is roughly the database size plus the files volume size (check with
`sudo du -sh /var/lib/docker/volumes/dossipv_files`). With 7 daily copies (weekly ones are hard
links to a daily copy while it exists, then the only copy) plan for ~11 × that size.

Prefer cron instead of systemd? One line in root's crontab (`sudo crontab -e`) does the same:

```
30 2 * * * /opt/dossipv/backup/backup.sh >>/var/log/dossipv-backup.log 2>&1
```

## 2. Choose the off-site destination

Local copies alone do not survive losing the server. Not chosen yet: any storage
[rclone](https://rclone.org/overview/) supports works, set as `BACKUP_RCLONE_REMOTE`. Until it is
set, each run logs `off-site: skipped`.

Install rclone on the server: `sudo apt install rclone` (or the latest from rclone.org). Configure
it **as root** (the backup runs as root; the config goes to `/root/.config/rclone/rclone.conf`):
`sudo rclone config`.

Options, cheapest first for a few GB:

| Destination | rclone type | Notes |
| --- | --- | --- |
| Backblaze B2 | `b2` | 10 GB free, then cheap; create a bucket and an application key restricted to it. |
| S3-compatible (OVHcloud Object Storage, Scaleway, Wasabi, AWS S3) | `s3` (pick the provider) | OVH is where the server already is — pick a **different region** than the server. Key restricted to one bucket. |
| Google Drive | `drive` | Free 15 GB; needs an OAuth login (`rclone authorize "drive"` on a machine with a browser, paste the token). Use a dedicated account, not a personal one. |

**Always wrap it in a `crypt` remote** so the provider only stores encrypted data:

```text
sudo rclone config
  n) New remote  → name: b2raw     → type: b2     → account + key
  n) New remote  → name: dossipv-offsite → type: crypt
       remote: b2raw:<bucket>/dossipv
       filename_encryption: standard
       password: <generate>   password2: <generate>
```

Then in `/etc/dossipv/backup.env`:

```bash
BACKUP_RCLONE_REMOTE=dossipv-offsite:
```

**Store the two crypt passwords outside the server** (password manager). Without them the
off-site copies cannot be read; with only the server's `rclone.conf` they can — that file is the
key, keep it root-only. Also keep a copy of `rclone.conf` in the password manager: after losing the
server it is what lets you reach the off-site copies.

How the off-site copy behaves: each run `rclone copy`s the new backup into `daily/<date>` (and
`weekly/<date>` on Sundays); it never mirrors local deletions, so wiping the server's backups does
not wipe the off-site ones. Off-site copies are aged out by date: by default like the local ones (daily older than 8 days,
weekly older than 29 days); `BACKUP_REMOTE_KEEP_DAILY` and `BACKUP_REMOTE_KEEP_WEEKLY` keep them
longer than the server's disk allows.

Optional dead man's switch: create a heartbeat check (healthchecks.io free tier, or a Better Stack
heartbeat) expecting one ping a day with a few hours of grace, and set
`BACKUP_HEARTBEAT_URL=<its ping URL>`. You get an e-mail when a night's backup does not finish.

## 3. Run it by hand, check it worked

```bash
sudo systemctl start dossipv-backup.service       # same as the nightly run
journalctl -u dossipv-backup.service -n 50 --no-pager
```

A good run ends with `done`; a failed one logs `ERROR: …` then `FAILED`, exits non-zero, and
`systemctl status dossipv-backup.service` shows `failed`. A failed run never touches the previous
backups (it works in a hidden `.YYYY-MM-DD.partial` directory and only renames it at the end).

Check a backup:

```bash
sudo ls -la /var/backups/dossipv/daily/
cd /var/backups/dossipv/daily/$(date +%F) && sudo sha256sum -c SHA256SUMS
sudo docker exec -i dossipv-postgres-1 pg_restore --list < dossipv.dump | head    # the dump is readable
sudo tar -tzf files.tar.gz | head                                                  # the archive lists
sudo rclone ls dossipv-offsite:daily/$(date +%F)                                   # off-site copy exists
```

The script already runs the `pg_restore --list` and `gzip -t` checks itself; only a restore proves a
backup is usable, hence the drill below.

## 4. Restore drill (do it before launch, then every few months)

Restores into a **separate** database and a scratch folder; production keeps running untouched.

1. Pick a backup: `sudo ls /var/backups/dossipv/daily /var/backups/dossipv/weekly`.
   To drill from the off-site copy (the real disaster case), download it first:
   ```bash
   sudo rclone copy dossipv-offsite:daily/2026-10-24 /root/drill/2026-10-24
   ```
2. Run the drill (asks you to type `drill`):
   ```bash
   sudo /opt/dossipv/backup/restore.sh --scratch 2026-10-24          # or --scratch /root/drill/2026-10-24
   ```
   It checks the checksums, recreates the database `dossipv_restore_check` in the same Postgres
   container, restores the dump into it, and extracts the files into
   `/var/backups/dossipv/restore-check/2026-10-24/files`.
3. Compare with production:
   ```bash
   for db in dossipv dossipv_restore_check; do
     sudo docker exec dossipv-postgres-1 psql -U dossipv -d $db -Atc \
       "SELECT '$db', (SELECT count(*) FROM company), (SELECT count(*) FROM project),
               (SELECT count(*) FROM file), (SELECT count(*) FROM dossier_job),
               (SELECT max(finished_at) FROM _prisma_migrations)"
   done
   sudo find /var/backups/dossipv/restore-check/2026-10-24/files -type f | wc -l
   sudo docker run --rm -v dossipv_files:/data:ro --entrypoint sh postgres:18-alpine -c 'find /data -type f | wc -l'
   ```
   Counts should match production as of the backup (production may have a few more rows since).
   Pick one `"storageKey"` from `file` in the scratch database (`SELECT "storageKey" FROM file LIMIT 1`) and check the file exists under the
   restored `files/` folder.
4. Clean up:
   ```bash
   sudo docker exec dossipv-postgres-1 psql -U dossipv -d postgres -c 'DROP DATABASE dossipv_restore_check'
   sudo rm -rf /var/backups/dossipv/restore-check /root/drill
   ```
5. Note the date and the result of the drill (e.g. in the ops log / this runbook's history).

## 5. Real restore (production)

Only when production data is lost or corrupted. Everything written after the backup is lost.

```bash
sudo /opt/dossipv/backup/restore.sh 2026-10-24                 # database + files
sudo /opt/dossipv/backup/restore.sh --db-only 2026-10-24       # database only
sudo /opt/dossipv/backup/restore.sh --files-only 2026-10-24    # files only
```

It asks you to type `restore`, then:

1. checks the checksums;
2. stops `dossipv-app-1` and `dossipv-worker-1` (so nothing writes during the restore);
3. saves the current database and/or files to `/var/backups/dossipv/pre-restore/<timestamp>/` — if
   the restore was a mistake, undo it with
   `restore.sh /var/backups/dossipv/pre-restore/<timestamp>` (add `--db-only` / `--files-only`
   if only one part was saved);
4. restores the database with `pg_restore --clean --if-exists --single-transaction` (all or
   nothing: on error the database is left as it was);
5. empties the files volume and extracts the archive into it;
6. starts app and worker again (also when a step failed).

Then check `https://<domain>/api/health` answers `{"status":"ok"}`, log in, open a project and
download a dossier.

If the server itself is gone: provision a new one, deploy as usual (the workflow creates the
containers, the volume and an empty database with the migrations), install rclone with the saved
`rclone.conf`, `rclone copy` the latest backup down, then run `restore.sh <that directory>`.

The `pre-restore/` directories are not pruned automatically: delete them once the restore is
confirmed good.
