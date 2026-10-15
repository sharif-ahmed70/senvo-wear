# Backup and Restore

Covers the local/development PostgreSQL database `senvo_wear_dev` and the media
folder. Production backups must follow the hosting provider's managed backup
policy; the same `pg_dump`/`pg_restore` commands apply.

## Daily backup

`scripts/backup-db.ps1` runs `pg_dump` in custom format and writes
`senvo_wear_dev-daily-YYYYMMDD-HHmmss.dump` to `C:\SENVO_TRANSFER\DATABASE\`.

- It verifies the archive with `pg_restore --list` before keeping it.
- It keeps the newest 14 `senvo_wear_dev-daily-*.dump` files and deletes only
  those. Other files in the folder (for example `pre-*.dump`) are never touched.
- Credentials come from `PGUSER`/`PGPASSWORD`/`PGPASSFILE` or a trust-auth local
  server. No password is stored in the repo.

Run once by hand:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\xampp\htdocs\SENVO Wear\scripts\backup-db.ps1"
```

Schedule it daily (adjust the time):

```powershell
schtasks /Create /SC DAILY /ST 22:00 /TN "SENVO DB Backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\xampp\htdocs\SENVO Wear\scripts\backup-db.ps1\""
```

Take a manual, named backup before any risky change (migration, restore):

```powershell
pg_dump -h 127.0.0.1 -p 5432 -U postgres -Fc -f "C:\SENVO_TRANSFER\DATABASE\pre-<reason>-<yyyymmdd-hhmm>.dump" senvo_wear_dev
```

## Media

Product images live in the folder set by `MEDIA_STORAGE_ROOT` (default
`.senvo-media` at the repo root). Back it up with the database:

```powershell
Compress-Archive -Path "C:\xampp\htdocs\SENVO Wear\.senvo-media\*" -DestinationPath "C:\SENVO_TRANSFER\MEDIA\senvo-media-<yyyymmdd>.zip"
```

## Restore (always into a NEW database first)

Never restore over the live database without a fresh backup of it.

1. Pick the newest dump (by date, not by name) and list it:
   ```powershell
   Get-ChildItem C:\SENVO_TRANSFER\DATABASE\*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, LastWriteTime
   pg_restore --list "C:\SENVO_TRANSFER\DATABASE\<dump>" | Select-Object -First 15
   ```
2. Create a new, empty database with a new name:
   ```powershell
   createdb -h 127.0.0.1 -p 5432 -U postgres senvo_wear_restore_<yyyymmdd>
   ```
3. Restore into it (no `--clean` needed on an empty database):
   ```powershell
   pg_restore -h 127.0.0.1 -p 5432 -U postgres -d senvo_wear_restore_<yyyymmdd> --no-owner "C:\SENVO_TRANSFER\DATABASE\<dump>"
   ```
4. Verify:
   ```powershell
   psql -h 127.0.0.1 -p 5432 -U postgres -d senvo_wear_restore_<yyyymmdd> -c "select count(*) from information_schema.tables where table_schema='public';"
   psql -h 127.0.0.1 -p 5432 -U postgres -d senvo_wear_restore_<yyyymmdd> -c "select count(*) from _prisma_migrations;"
   psql -h 127.0.0.1 -p 5432 -U postgres -d senvo_wear_restore_<yyyymmdd> -c "select count(*) from products;"
   ```
5. Check migration state against the restored copy only (read-only, never `migrate dev` or `migrate reset`):
   set `DATABASE_URL` to the restored database and run
   `pnpm --filter @senvo/database exec prisma migrate status`. Apply newer
   migrations with `prisma migrate deploy` only if status says some are pending.
6. Optional: point the apps at the restored copy (change `DATABASE_URL` in `.env`,
   restart with `C:\SENVO_TRANSFER\start-senvo.ps1`) and click through Admin and
   the Storefront.

### Replacing the live database (only after step 1-5 look correct)

1. Take a fresh backup of the live database first:
   `powershell -File scripts\backup-db.ps1` (or a named `pre-restore-*.dump`).
2. Stop the apps (close the services, or run `start-senvo.ps1` later to restart).
3. Rename instead of dropping, so the old data stays recoverable:
   ```powershell
   psql -h 127.0.0.1 -U postgres -d postgres -c "ALTER DATABASE senvo_wear_dev RENAME TO senvo_wear_dev_old_<yyyymmdd>;"
   psql -h 127.0.0.1 -U postgres -d postgres -c "ALTER DATABASE senvo_wear_restore_<yyyymmdd> RENAME TO senvo_wear_dev;"
   ```
   (Rename fails if anything is connected; stop the apps first.)
4. Start the apps and verify `/` and Admin `/login`. Drop `senvo_wear_dev_old_*`
   only after you are sure it is no longer needed.

## Fresh machine

See `SETUP_GUIDE.md` in `C:\SENVO_TRANSFER`: it restores the newest dump and
starts everything with `C:\SENVO_TRANSFER\start-senvo.ps1`.
